// lib/hf-adapter.ts
// The ONLY file that knows Higgsfield's data shape. Now token-based REST
// (no CLI) against fnf.higgsfield.ai/agents/* — so it works on localhost AND
// on Vercel. Pass a Bearer access token (from the active hf_connection).
const API_BASE = 'https://fnf.higgsfield.ai'

/** Thrown on HTTP 401 so the caller can refresh the token and retry. */
export class HFUnauthorizedError extends Error {
  constructor() {
    super('Higgsfield token unauthorized')
    this.name = 'HFUnauthorizedError'
  }
}

async function hfGet<T>(path: string, accessToken: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'hf-cli/1.0',
      },
    })
  } catch {
    // Retry once on a cold-connection network throw.
    res = await fetch(`${API_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'hf-cli/1.0',
      },
    })
  }
  if (res.status === 401) throw new HFUnauthorizedError()
  if (!res.ok) {
    throw new Error(`Higgsfield API ${path} → ${res.status} ${res.statusText}`)
  }
  return res.json()
}

/**
 * Walk a cursor-paginated HF list endpoint and return its items.
 *
 * The API returns { items, next_cursor } newest-first; a full page (== PAGE_SIZE)
 * plus a non-null cursor means there's more. PAGE_CAP bounds the loop so a
 * misbehaving API can never spin forever.
 *
 * Incremental mode: pass opts.sinceMs (+ opts.timeOf to read an item's epoch ms).
 * Because items are newest-first, we keep items at/after sinceMs and STOP the
 * moment we hit an older one — so a repeat sync only pulls the recent tail
 * instead of re-walking the whole history.
 */
async function fetchAllPages<T>(
  basePath: string,
  accessToken: string,
  opts?: { sinceMs?: number; timeOf?: (item: T) => number }
): Promise<T[]> {
  const PAGE_SIZE = 100
  const PAGE_CAP = 1000 // up to 100k rows
  const sinceMs = opts?.sinceMs
  const timeOf = opts?.timeOf
  const incremental = sinceMs != null && timeOf != null
  const all: T[] = []
  let cursor: number | null = 0
  for (let page = 0; page < PAGE_CAP; page++) {
    const res: { items?: T[]; next_cursor?: number | null } = await hfGet(
      `${basePath}?size=${PAGE_SIZE}&cursor=${cursor}`,
      accessToken
    )
    const items = res.items || []

    if (incremental) {
      let crossedBoundary = false
      for (const it of items) {
        if (timeOf!(it) >= sinceMs!) all.push(it)
        else {
          crossedBoundary = true
          break // newest-first → everything after here is older too
        }
      }
      if (crossedBoundary) break
    } else {
      all.push(...items)
    }

    if (items.length < PAGE_SIZE || res.next_cursor == null) break
    cursor = res.next_cursor
  }
  return all
}

// --- Raw shapes from the REST API ---
interface HFJob {
  id: string
  status: string
  display_name: string
  job_set_type: string
  result_url: string
  created_at: number // Unix float
  params: { prompt?: string; [k: string]: unknown }
}
interface HFTransaction {
  id?: string // present on some responses; used for stable feature-gen ids
  display_name: string
  credits: number // negative for spend, positive for refund/grant
  action: string // 'spend' | 'refund' | 'grant' | ...
  created_at: string // ISO
}

/**
 * Normalize a model name for matching. Higgsfield writes the SAME model
 * differently on jobs vs transactions — different word order, casing, and
 * punctuation (e.g. "Cinematic Studio 3.5 Video" vs "Cinematic Studio Video
 * 3.5"). Lowercasing + token-sorting collapses those into one key.
 */
function normName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(' ')
}

/**
 * Attribute a set of transactions onto jobs by NORMALIZED name + nearest time.
 *
 * Returns:
 *  - credited[jobIndex] — total |credits| landed on each job
 *  - leftover           — transactions whose name matches NO job (feature
 *                         charges like Voiceover that have no /agents/jobs row)
 *
 * Pass 1 is 1:1 (each transaction claims the nearest UNUSED job of its model,
 * so credits spread across sibling generations). Pass 2 piles genuine extra
 * charges (a model with more charges than jobs) onto the nearest job so the
 * TOTAL is preserved. Used for spend (add) and refund (subtract) alike.
 */
function attributeToJobs(
  jobs: HFJob[],
  txs: HFTransaction[]
): { credited: number[]; leftover: HFTransaction[] } {
  const jobsByName = new Map<
    string,
    { idx: number; timeMs: number; used: boolean }[]
  >()
  jobs.forEach((j, idx) => {
    const key = normName(j.display_name)
    const entry = { idx, timeMs: j.created_at * 1000, used: false }
    const arr = jobsByName.get(key)
    if (arr) arr.push(entry)
    else jobsByName.set(key, [entry])
  })

  const credited = new Array<number>(jobs.length).fill(0)
  const overflow: HFTransaction[] = []
  const leftover: HFTransaction[] = []

  for (const tx of txs) {
    const bucket = jobsByName.get(normName(tx.display_name))
    if (!bucket || bucket.length === 0) {
      leftover.push(tx) // no job of this model → a feature charge
      continue
    }
    const txMs = new Date(tx.created_at).getTime()
    let best = -1
    let bestDiff = Infinity
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].used) continue
      const d = Math.abs(bucket[i].timeMs - txMs)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    }
    if (best === -1) {
      overflow.push(tx) // model ran out of unused jobs → genuine extra charge
      continue
    }
    bucket[best].used = true
    credited[bucket[best].idx] += Math.abs(tx.credits)
  }

  for (const tx of overflow) {
    const bucket = jobsByName.get(normName(tx.display_name))!
    const txMs = new Date(tx.created_at).getTime()
    let best = 0
    let bestDiff = Math.abs(bucket[0].timeMs - txMs)
    for (let i = 1; i < bucket.length; i++) {
      const d = Math.abs(bucket[i].timeMs - txMs)
      if (d < bestDiff) {
        bestDiff = d
        best = i
      }
    }
    credited[bucket[best].idx] += Math.abs(tx.credits)
  }
  return { credited, leftover }
}

/** Stable id for a feature generation, so re-syncs upsert instead of duplicate. */
function featureExternalId(tx: HFTransaction): string {
  if (tx.id) return `feat:${tx.id}`
  return `feat:${normName(tx.display_name)}:${tx.created_at}:${Math.abs(tx.credits)}`
}

/**
 * Build generation rows for feature charges that have no /agents/jobs row
 * (Voiceover, Voice Change, Marketing Studio Video, Topaz Video, …). One row
 * per spend transaction; refunds of the same model are netted onto the nearest
 * feature row so the credits stay exact. These rows carry no media URL.
 */
function buildFeatureGenerations(
  spendLeftover: HFTransaction[],
  refundLeftover: HFTransaction[]
): Generation[] {
  type FeatureGen = Generation & { _timeMs: number }
  const gens: FeatureGen[] = spendLeftover.map((tx) => ({
    externalId: featureExternalId(tx),
    displayName: tx.display_name,
    jobSetType: 'feature',
    resultUrl: '',
    mediaType: 'feature',
    prompt: '',
    credits: Math.abs(tx.credits),
    createdAt: new Date(tx.created_at).toISOString(),
    _timeMs: new Date(tx.created_at).getTime(),
  }))

  const byName = new Map<string, FeatureGen[]>()
  for (const g of gens) {
    const key = normName(g.displayName)
    const arr = byName.get(key)
    if (arr) arr.push(g)
    else byName.set(key, [g])
  }
  for (const tx of refundLeftover) {
    const bucket = byName.get(normName(tx.display_name))
    if (!bucket || bucket.length === 0) continue
    const txMs = new Date(tx.created_at).getTime()
    let best = bucket[0]
    let bestDiff = Math.abs(best._timeMs - txMs)
    for (let i = 1; i < bucket.length; i++) {
      const d = Math.abs(bucket[i]._timeMs - txMs)
      if (d < bestDiff) {
        bestDiff = d
        best = bucket[i]
      }
    }
    best.credits -= Math.abs(tx.credits)
  }

  return gens.map(({ _timeMs: _omit, ...g }) => g)
}

// --- Our internal type ---
export interface Generation {
  externalId: string
  displayName: string
  jobSetType: string
  resultUrl: string
  mediaType: 'image' | 'video' | 'feature'
  prompt: string
  credits: number
  createdAt: string
}

function detectMediaType(url: string): 'image' | 'video' {
  if (/\.(mp4|mov|webm|avi)$/i.test(url)) return 'video'
  return 'image'
}

/**
 * Fetch generations with their matched credit cost.
 *
 * Full mode (sinceMs omitted): walks the entire jobs + transactions history.
 * Incremental mode (sinceMs given): only pulls jobs/transactions at or after
 * sinceMs — the caller passes the newest hf_created_at already stored minus a
 * safety overlap, so a repeat sync is a few seconds instead of a full re-walk.
 */
export async function fetchHFGenerations(
  accessToken: string,
  sinceMs?: number
): Promise<Generation[]> {
  // Both endpoints are cursor-paginated newest-first. In incremental mode the
  // paginator stops as soon as it crosses sinceMs (see fetchAllPages).
  const [allJobs, allTx] = await Promise.all([
    fetchAllPages<HFJob>('/agents/jobs', accessToken, {
      sinceMs,
      timeOf: (j) => j.created_at * 1000,
    }),
    fetchAllPages<HFTransaction>('/agents/transactions', accessToken, {
      sinceMs,
      timeOf: (t) => new Date(t.created_at).getTime(),
    }),
  ])

  // Only completed jobs — failed/cancelled don't produce usable output.
  const jobs = allJobs.filter((j) => j.status === 'completed')

  // NET credit per generation = gross spend − refunds, attributed by NORMALIZED
  // name so transaction/job name-format differences don't drop credits. This
  // makes the org total match Higgsfield's net "credits spent" (gross − refunds).
  const spend = allTx.filter((t) => t.action === 'spend')
  const refunds = allTx.filter((t) => t.action === 'refund')
  const spendByJob = attributeToJobs(jobs, spend)
  const refundByJob = attributeToJobs(jobs, refunds)

  const jobGens: Generation[] = jobs.map((job, idx) => ({
    externalId: job.id,
    displayName: job.display_name,
    jobSetType: job.job_set_type,
    resultUrl: job.result_url,
    mediaType: detectMediaType(job.result_url),
    prompt: (job.params?.prompt || '').substring(0, 300).trim(),
    credits: spendByJob.credited[idx] - refundByJob.credited[idx],
    createdAt: new Date(job.created_at * 1000).toISOString(),
  }))

  // Feature charges (Voiceover, Voice Change, Marketing Studio Video, …) aren't
  // in /agents/jobs — they only appear as transactions. Materialize them as
  // generation rows so the count matches Higgsfield's total and every credit is
  // attributable to a client.
  const featureGens = buildFeatureGenerations(
    spendByJob.leftover,
    refundByJob.leftover
  )

  return [...jobGens, ...featureGens]
}

/**
 * Diagnostic: where do the credits go? Runs the SAME match as the real sync,
 * then reports the totals and the leftover (unmatched) spend transactions
 * grouped by name — so we can see whether the gap is name-mismatch (feature
 * charges with no job) or multiple spend transactions per job.
 */
export async function fetchHFCreditDebug(accessToken: string): Promise<{
  spendTxCount: number
  spendTxTotal: number
  jobsCount: number
  jobNamesSample: string[]
  matchedJobs: number
  matchedCredits: number
  leftoverTotal: number
  leftoverByName: { name: string; count: number; credits: number; isJobName: boolean }[]
  actionBreakdown: { action: string; count: number; total: number }[]
  netSpent: number
  txEarliest: string | null
  txLatest: string | null
  spendAfterFeb4: number
  rawJobSample: unknown[]
  batchFieldTally: Record<string, number>
  refundTotal: number
  netSpendTarget: number
  jobGenCount: number
  featureGenCount: number
  totalGenCount: number
  totalNetCredits: number
}> {
  const [jobs, allTx] = await Promise.all([
    fetchAllPages<HFJob>('/agents/jobs', accessToken),
    fetchAllPages<HFTransaction>('/agents/transactions', accessToken),
  ])

  // Compact shape check: top-level keys only (full sample already inspected).
  const rawJobSample = jobs.slice(0, 2).map((j) => Object.keys(j))
  const batchFieldTally: Record<string, number> = {}
  for (const j of jobs) {
    const p = (j.params || {}) as Record<string, unknown>
    for (const key of [
      'batch_size',
      'num_images',
      'num_outputs',
      'multi_shots',
      'n',
      'count',
    ]) {
      const v = p[key]
      if (typeof v === 'number' && v > 1) {
        const k = `${key}=${v}`
        batchFieldTally[k] = (batchFieldTally[k] || 0) + 1
      }
    }
  }
  const spend = allTx.filter((t) => t.action === 'spend')
  const spendTxTotal = spend.reduce((s, t) => s + Math.abs(t.credits), 0)
  const jobNormNames = new Set(jobs.map((j) => normName(j.display_name)))

  // Every action type with signed totals — reveals refunds/bonuses/topups that
  // make Higgsfield's net "credits spent" differ from our gross spend.
  const actionMap = new Map<string, { count: number; total: number }>()
  for (const t of allTx) {
    const cur = actionMap.get(t.action) || { count: 0, total: 0 }
    cur.count++
    cur.total += t.credits
    actionMap.set(t.action, cur)
  }
  const actionBreakdown = [...actionMap.entries()]
    .map(([action, v]) => ({
      action,
      count: v.count,
      total: Math.round(v.total * 10) / 10,
    }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  // Net = signed sum of ALL transactions (spend is negative, refunds positive).
  const netSpent =
    Math.round(allTx.reduce((s, t) => s + t.credits, 0) * 10) / 10

  // Date span + how much spend falls on/after the dashboard's Feb 4 2026 cutoff.
  const FEB4_MS = new Date('2026-02-04T00:00:00Z').getTime()
  let earliest = Infinity
  let latest = -Infinity
  let spendAfterFeb4 = 0
  for (const t of allTx) {
    const ms = new Date(t.created_at).getTime()
    if (ms < earliest) earliest = ms
    if (ms > latest) latest = ms
  }
  for (const t of spend) {
    if (new Date(t.created_at).getTime() >= FEB4_MS) {
      spendAfterFeb4 += Math.abs(t.credits)
    }
  }

  // Mirror the real sync: net spend − refunds onto jobs, plus feature rows.
  const refunds = allTx.filter((t) => t.action === 'refund')
  const refundTotal = refunds.reduce((s, t) => s + Math.abs(t.credits), 0)
  const spendByJob = attributeToJobs(jobs, spend)
  const refundByJob = attributeToJobs(jobs, refunds)
  const jobNet = spendByJob.credited.map((c, i) => c - refundByJob.credited[i])
  const jobNetTotal = jobNet.reduce((s, c) => s + c, 0)
  const featureGens = buildFeatureGenerations(
    spendByJob.leftover,
    refundByJob.leftover
  )
  const featureNetTotal = featureGens.reduce((s, g) => s + g.credits, 0)
  const matchedCredits = jobNetTotal
  const matchedJobs = jobNet.filter((c) => c > 0).length

  // Leftover = spend transactions whose normalized name matches NO job.
  const leftoverMap = new Map<string, { count: number; credits: number }>()
  let leftoverTotal = 0
  for (const tx of spend) {
    if (jobNormNames.has(normName(tx.display_name))) continue
    const c = Math.abs(tx.credits)
    leftoverTotal += c
    const cur = leftoverMap.get(tx.display_name) || { count: 0, credits: 0 }
    cur.count++
    cur.credits += c
    leftoverMap.set(tx.display_name, cur)
  }
  const leftoverByName = [...leftoverMap.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      credits: Math.round(v.credits * 10) / 10,
      isJobName: false,
    }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 20)

  return {
    spendTxCount: spend.length,
    spendTxTotal: Math.round(spendTxTotal * 10) / 10,
    jobsCount: jobs.length,
    jobNamesSample: [...new Set(jobs.map((j) => j.display_name))].slice(0, 20),
    matchedJobs,
    matchedCredits: Math.round(matchedCredits * 10) / 10,
    leftoverTotal: Math.round(leftoverTotal * 10) / 10,
    leftoverByName,
    actionBreakdown,
    netSpent,
    txEarliest: earliest === Infinity ? null : new Date(earliest).toISOString(),
    txLatest: latest === -Infinity ? null : new Date(latest).toISOString(),
    spendAfterFeb4: Math.round(spendAfterFeb4 * 10) / 10,
    rawJobSample,
    batchFieldTally,
    refundTotal: Math.round(refundTotal * 10) / 10,
    netSpendTarget: Math.round((spendTxTotal - refundTotal) * 10) / 10,
    jobGenCount: jobs.length,
    featureGenCount: featureGens.length,
    totalGenCount: jobs.length + featureGens.length,
    totalNetCredits: Math.round((jobNetTotal + featureNetTotal) * 10) / 10,
  }
}

/** Account email + plan + balance — used to label a new connection. */
export async function fetchHFBalance(accessToken: string): Promise<{
  email: string
  plan: string
  credits: number
}> {
  const data = await hfGet<{
    email: string
    credits: number
    subscription_plan_type: string
  }>('/agents/balance', accessToken)
  return {
    email: data.email,
    plan: data.subscription_plan_type,
    credits: data.credits,
  }
}
