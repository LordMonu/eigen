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
  display_name: string
  credits: number // negative for spend
  action: string
  created_at: string // ISO
}

// --- Our internal type ---
export interface Generation {
  externalId: string
  displayName: string
  jobSetType: string
  resultUrl: string
  mediaType: 'image' | 'video'
  prompt: string
  credits: number
  createdAt: string
}

function detectMediaType(url: string): 'image' | 'video' {
  if (/\.(mp4|mov|webm|avi)$/i.test(url)) return 'video'
  return 'image'
}

/**
 * Fetch completed generations with their matched credit cost.
 * Matches each job to a spend transaction by display_name + timestamp (5s window).
 */
export async function fetchHFGenerations(
  accessToken: string
): Promise<Generation[]> {
  // Jobs + first transaction page in parallel — saves one full round-trip.
  const [jobsRes, tx1Res] = await Promise.all([
    hfGet<{ items: HFJob[] }>('/agents/jobs?size=100', accessToken),
    hfGet<{ items: HFTransaction[]; next_cursor?: number }>(
      '/agents/transactions?size=100&cursor=0',
      accessToken
    ),
  ])
  const jobs = jobsRes.items || []

  // Continue paginating transactions if the first page was full.
  const allTx: HFTransaction[] = [...(tx1Res.items || [])]
  if ((tx1Res.items || []).length >= 100 && tx1Res.next_cursor != null) {
    let cursor = tx1Res.next_cursor
    for (let page = 1; page < 5; page++) {
      const txRes = await hfGet<{ items: HFTransaction[]; next_cursor?: number }>(
        `/agents/transactions?size=100&cursor=${cursor}`,
        accessToken
      )
      const items = txRes.items || []
      allTx.push(...items)
      if (items.length < 100 || txRes.next_cursor == null) break
      cursor = txRes.next_cursor
    }
  }
  const spendTransactions = allTx.filter((t) => t.action === 'spend')

  const MATCH_WINDOW_MS = 5000
  const usedTransactionIndices = new Set<number>()

  return jobs
    .filter((job) => job.status === 'completed')
    .map((job) => {
      const jobTimeMs = job.created_at * 1000
      let bestMatchIndex = -1
      let bestMatchDiff = Infinity

      spendTransactions.forEach((tx, index) => {
        if (usedTransactionIndices.has(index)) return
        if (tx.display_name !== job.display_name) return
        const txTimeMs = new Date(tx.created_at).getTime()
        const diff = Math.abs(txTimeMs - jobTimeMs)
        if (diff < MATCH_WINDOW_MS && diff < bestMatchDiff) {
          bestMatchDiff = diff
          bestMatchIndex = index
        }
      })

      let credits = 0
      if (bestMatchIndex !== -1) {
        credits = Math.abs(spendTransactions[bestMatchIndex].credits)
        usedTransactionIndices.add(bestMatchIndex)
      }

      return {
        externalId: job.id,
        displayName: job.display_name,
        jobSetType: job.job_set_type,
        resultUrl: job.result_url,
        mediaType: detectMediaType(job.result_url),
        prompt: (job.params?.prompt || '').substring(0, 300).trim(),
        credits,
        createdAt: new Date(job.created_at * 1000).toISOString(),
      }
    })
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
