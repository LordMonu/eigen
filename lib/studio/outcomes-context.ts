// lib/studio/outcomes-context.ts — Phase 6 Tier-2 retrieval.
//
// Compresses the org's recorded outcome history into a compact context block
// that's injected into the scorer system prompt. The scorer uses that
// retrieval-augmented context to calibrate scores against what historically
// went viral (or didn't) for THIS team — instead of a generic rubric.
//
// Activation threshold is intentionally a SOFT signal: below TIER2_THRESHOLD
// outcomes, the function returns tier=1 + empty contextBlock and the scorer
// behaves exactly as it did in Phase 2. Above the threshold, tier=2 + a
// compressed outcome summary.
//
// Token-budget guard: regardless of total outcome count we cap at
// MAX_VIRAL + MAX_NON_VIRAL lines (≤ ~40 lines, ~1.5k tokens worst case).
// The hard caps protect the scorer's input window from a runaway training
// corpus and keep the user prompt comfortably under model limits.

import type { createClient } from '@/lib/supabase-server'

export const TIER2_THRESHOLD = 50
const FETCH_LIMIT = 80          // overfetch a bit so platform filtering still has signal
const MAX_VIRAL = 20            // hardest cap — see token-budget note above
const MAX_NON_VIRAL = 20
const HOOK_MAX = 80             // hook string slice; tunable if scorer drifts
const TONE_MAX = 30

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface OutcomeContext {
  /** 1 when below threshold, 2 when retrieval is active. */
  tier: 1 | 2
  /** Total outcomes for the org (NOT filtered by media_type — UI signal). */
  outcomeCount: number
  /** Compact summary block to inject into scorerSystemPrompt. '' for tier 1. */
  contextBlock: string
}

/**
 * Build the outcome-grounded context for a scorer call.
 *
 * - Counts outcomes for the org (used for the UI "X/50 unlocks Tier-2" gauge
 *   AND the tier decision).
 * - If the org is below threshold, returns tier=1 with empty contextBlock —
 *   the scorer prompt is unchanged.
 * - Otherwise fetches the most recent outcomes filtered to the requested
 *   media_type via a foreign-table join, compresses each to a one-line
 *   summary, splits into viral vs non-viral buckets and caps each bucket so
 *   the injected context stays bounded regardless of corpus size.
 *
 * Errors swallowed → falls back to tier=1. Scoring must never block on the
 * outcome lookup; if the join misfires we just lose the calibration boost.
 */
export async function buildOutcomeContext(
  supabase: SupabaseClient,
  orgId: string,
  mediaType: 'video' | 'image',
): Promise<OutcomeContext> {
  // Org-wide outcome count — used by the tier gate AND surfaced on the
  // Studio home page. Cheap; head=true skips the row payload entirely.
  const { count, error: countErr } = await supabase
    .from('generation_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
  if (countErr) {
    console.warn(
      '[studio:outcomes-context] count failed, falling back to tier=1:',
      countErr.message,
    )
    return { tier: 1, outcomeCount: 0, contextBlock: '' }
  }

  const outcomeCount = count ?? 0

  if (outcomeCount < TIER2_THRESHOLD) {
    return { tier: 1, outcomeCount, contextBlock: '' }
  }

  // Fetch recent outcomes joined to their blueprint's schema_json so we can
  // extract the hook/tone for calibration signal. !inner forces the join — an
  // outcome whose blueprint was deleted (FK SET NULL → blueprint_id IS NULL)
  // is excluded, which is what we want: no schema = no signal.
  const { data: outcomes, error: fetchErr } = await supabase
    .from('generation_outcomes')
    .select(
      `blueprint_id, platform, views, shares, saves, likes, went_viral, watch_time_avg_seconds,
       prompt_blueprints!inner(media_type, schema_json)`,
    )
    .eq('org_id', orgId)
    .eq('prompt_blueprints.media_type', mediaType)
    .order('recorded_at', { ascending: false })
    .limit(FETCH_LIMIT)

  if (fetchErr || !outcomes || outcomes.length === 0) {
    if (fetchErr) {
      console.warn(
        '[studio:outcomes-context] outcomes fetch failed, falling back to tier=1:',
        fetchErr.message,
      )
    }
    return { tier: 1, outcomeCount, contextBlock: '' }
  }

  // Compress each outcome → one line. Defensive against partial blueprint
  // schema fields (some pre-Phase-2 rows may have missing optional keys).
  const lines: { line: string; viral: boolean }[] = []
  for (const o of outcomes) {
    // Supabase typed inner-join can come back as object OR array depending on
    // the cardinality the type generator infers. Normalize.
    const bpRaw = (o as { prompt_blueprints?: unknown }).prompt_blueprints
    const bp = Array.isArray(bpRaw) ? bpRaw[0] : bpRaw
    const schema =
      bp && typeof bp === 'object'
        ? ((bp as { schema_json?: Record<string, unknown> }).schema_json ?? {})
        : {}

    const hookRaw =
      mediaType === 'video' ? schema.hook : schema.visual_hook
    const toneRaw = schema.tonality ?? schema.style_medium ?? ''
    const hook = String(hookRaw ?? '').slice(0, HOOK_MAX)
    const tone = String(toneRaw ?? '').slice(0, TONE_MAX)

    const platform = (o as { platform?: string | null }).platform ?? 'unknown'
    const views = Number((o as { views?: number }).views ?? 0)
    const shares = Number((o as { shares?: number }).shares ?? 0)
    const saves = Number((o as { saves?: number }).saves ?? 0)
    const likes = Number((o as { likes?: number }).likes ?? 0)
    const wentViral = Boolean((o as { went_viral?: boolean }).went_viral)

    const viewsK =
      views >= 1000 ? `${(views / 1000).toFixed(0)}K` : String(views)
    const engagement = shares + saves + likes
    const tag = wentViral ? 'VIRAL' : 'non-viral'

    lines.push({
      viral: wentViral,
      line: `[${tag}] ${viewsK} views, ${engagement} eng | platform:${platform} | tone:${tone || '—'} | hook:"${hook || '—'}"`,
    })
  }

  // Bucket + cap. Order within each bucket is already recorded_at DESC from
  // the query, so the most recent of each kind wins.
  const viral = lines.filter((l) => l.viral).slice(0, MAX_VIRAL)
  const nonViral = lines.filter((l) => !l.viral).slice(0, MAX_NON_VIRAL)

  // Edge case: an org could cross the count threshold but have zero outcomes
  // that match the requested media_type (e.g. 50 image outcomes, scoring a
  // video). In that case the buckets are empty — fall back to tier=1 rather
  // than inject an empty "USE THIS" instruction that confuses the model.
  if (viral.length === 0 && nonViral.length === 0) {
    return { tier: 1, outcomeCount, contextBlock: '' }
  }

  const contextBlock = [
    `ORG PERFORMANCE HISTORY (${viral.length + nonViral.length} past ${mediaType}s, most recent first):`,
    '',
    `WENT VIRAL (${viral.length}):`,
    ...viral.map((l) => l.line),
    '',
    `DID NOT GO VIRAL (${nonViral.length}):`,
    ...nonViral.map((l) => l.line),
    '',
    'Use this data to CALIBRATE your scores. If the planned prompt shares traits with VIRAL pieces (hook style, tone, platform fit), score higher on those factors and say so in your notes. If it shares traits with the non-viral pieces, score lower and explain which historical pattern it matches. Be specific — reference the patterns rather than re-quoting the lines.',
  ].join('\n')

  return { tier: 2, outcomeCount, contextBlock }
}
