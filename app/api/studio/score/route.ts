// app/api/studio/score/route.ts — virality scoring for one blueprint.
//
// Flow:
//   1) Auth + read blueprint (RLS gates this — user can only score their org's
//      blueprints).
//   2) If a tier-1 score already exists for this blueprint, return it without
//      calling Gemini. The auto-fetch on the variant card runs once per page
//      load; this guard catches the rest (two tabs, retry storm, double-mount).
//      A partial unique index on (blueprint_id) WHERE tier = 1 is the durable
//      backstop in case two requests race past this check.
//   3) Re-check membership against THE BLUEPRINT'S org (not the most-recent
//      one). RLS already gates org scope; this catches future role-dependent
//      permissions where the wrong org would silently grant the wrong role.
//   4) Call the LLM scorer with the blueprint's schema_json + the rubric prompt.
//   5) Compute OVERALL server-side via computeOverall() — never trust the
//      model's overall.
//   6) Insert one row into virality_scores. RLS gates this too.
//
// Note: the plan's snippet imported callClaude/parseClaudeJson from
// '@/lib/studio/claude'. The actual wrapper is llm.ts (OpenAI). This route
// uses the current names.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { callLLM, parseLLMJson, SCORER_MODEL } from '@/lib/studio/llm'
import { scorerSystemPrompt } from '@/lib/studio/system-prompts'
import {
  VIDEO_RUBRIC,
  IMAGE_RUBRIC,
  computeOverall,
  isEnhanceable,
} from '@/lib/studio/rubric'
import type { MediaType } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'
import { buildOutcomeContext } from '@/lib/studio/outcomes-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface FactorResult {
  score: number | string
  note: string
}

interface ScoreResponse {
  factors: Record<string, FactorResult>
  attention_curve: Array<{ second: number; retention: number }> | null
  summary: string
  fixes: Array<{ factor: string; fix: string }>
}

// Defensive caps for model output (string lengths + array sizes). GPT-4o is
// usually well-behaved under JSON mode, but a runaway response shouldn't
// inflate a JSONB row or crash the renderer.
const MAX_NOTE_LEN = 500
const MAX_FIX_LEN = 1000
const MAX_SUMMARY_LEN = 4000
const MAX_FIXES = 20
const MAX_CURVE_POINTS = 600 // 10 minutes @ 1 pt/sec — far past any short-form

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = (await req.json()) as { blueprintId?: string }
    const blueprintId = body.blueprintId
    if (!blueprintId) {
      return NextResponse.json({ error: 'blueprintId required' }, { status: 400 })
    }

    // RLS scopes this read to the user's org. .maybeSingle() returns null
    // (not error) when the blueprint exists outside the user's org.
    const { data: blueprint, error: bpErr } = await supabase
      .from('prompt_blueprints')
      .select('id, media_type, schema_json, org_id')
      .eq('id', blueprintId)
      .maybeSingle()
    if (bpErr) {
      console.error('[studio:score] blueprint read failed:', bpErr.message)
      return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
    }
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    // RBAC: check the role for the blueprint's actual org (not the user's
    // most-recently-approved membership). For studio.view this is currently
    // moot — all roles have view=true — but the day someone tightens that
    // permission, this guard prevents a creator-in-A from acting as a
    // master-in-B just because B was approved later.
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', blueprint.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 },
      )
    }
    if (!can(membership.role as Role, 'studio', 'view')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
    }

    // Idempotency: if there's already ANY score row for this blueprint,
    // return it. Saves an LLM call and prevents the duplicate-row pattern
    // (two tabs, retry, dev Strict Mode). The unique index on
    // (blueprint_id) WHERE tier=1 backstops Tier-1 races; for Tier-2 the
    // existence check is the only dedup (acceptable because the auto-fetch
    // on the variant card runs once per page load).
    //
    // Phase 6 — dropped `.eq('tier', 1)`. With Tier-2 scores landing in the
    // same table, restricting to tier=1 would have re-called the LLM on
    // every page reload of a Tier-2-scored blueprint.
    const { data: existing } = await supabase
      .from('virality_scores')
      .select(
        'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
      )
      .eq('blueprint_id', blueprintId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({
        score: existing,
        summary: existing.summary ?? '',
      })
    }

    const mediaType = blueprint.media_type as MediaType
    const rubric = mediaType === 'video' ? VIDEO_RUBRIC : IMAGE_RUBRIC

    // Phase 6 — retrieval-augmented context. Activates Tier 2 once the org
    // has ≥50 outcomes for this media_type; otherwise tier=1 + empty block
    // (Tier-1 behaviour unchanged).
    const { tier, contextBlock } = await buildOutcomeContext(
      supabase,
      blueprint.org_id,
      mediaType,
    )

    // Track the actual model used. callLLM falls back to gpt-4o-mini on
    // 5xx/429 of the primary; recording SCORER_MODEL directly would lie.
    let modelUsed = SCORER_MODEL
    const rawText = await callLLM({
      system: scorerSystemPrompt(mediaType, contextBlock || undefined),
      user: `PROMPT SCHEMA:\n${JSON.stringify(blueprint.schema_json, null, 2)}`,
      model: SCORER_MODEL,
      // 8 000 output tokens: 7 factor notes + attention curve (up to 600 pts)
      // + summary + fixes fits comfortably; 4 000 was tight for long videos.
      maxTokens: 8000,
      jsonMode: true, // OpenAI json_object mode guarantees parseable JSON output
      onModelUsed: (m) => {
        modelUsed = m
      },
    })

    const parsed = parseLLMJson<ScoreResponse>(rawText)

    // Lenient numeric coercion: accept numbers and numeric strings ('85',
    // '85.7'); fall back to 0 only when truly non-finite. Log when we have
    // to default — it's the cheapest signal that the prompt isn't binding.
    const factorScores: Record<string, number> = {}
    rubric.forEach((f) => {
      const rawScore = parsed.factors?.[f.key]?.score
      const n =
        typeof rawScore === 'number'
          ? rawScore
          : typeof rawScore === 'string'
            ? Number(rawScore)
            : NaN
      if (!Number.isFinite(n)) {
        console.warn(
          `[studio:score] missing/non-numeric ${f.key} for blueprint ${blueprintId}`,
        )
      }
      factorScores[f.key] = Math.max(
        0,
        Math.min(100, Math.round(Number.isFinite(n) ? n : 0)),
      )
    })

    const overall = computeOverall(factorScores, rubric)
    const enhanceable = isEnhanceable(factorScores, overall, rubric)

    // Persist labels + weights inline so the UI doesn't have to re-import
    // the rubric to render bars — and so historical scores still render
    // even if a rubric is reweighted later.
    const factorBreakdown: Record<
      string,
      { score: number; note: string; weight: number; label: string }
    > = {}
    rubric.forEach((f) => {
      factorBreakdown[f.key] = {
        score: factorScores[f.key],
        note: String(parsed.factors?.[f.key]?.note ?? '').slice(0, MAX_NOTE_LEN),
        weight: f.weight,
        label: f.label,
      }
    })

    // Attention curve: video only. Drop NaN/Infinity/negatives, clamp 0-100,
    // round to whole seconds/percent, cap at 10min of points.
    const validKeys = new Set(rubric.map((r) => r.key))
    const attentionCurve =
      mediaType === 'video' && Array.isArray(parsed.attention_curve)
        ? parsed.attention_curve
            .filter(
              (p) =>
                p &&
                Number.isFinite(p.second) &&
                p.second >= 0 &&
                Number.isFinite(p.retention),
            )
            .map((p) => ({
              second: Math.round(p.second),
              retention: Math.max(0, Math.min(100, Math.round(p.retention))),
            }))
            .slice(0, MAX_CURVE_POINTS)
        : null

    // Coerce + length-cap every string field; restrict factor keys to the
    // rubric so a malformed fix can't slip an object through to the renderer.
    const suggestedFixes = (Array.isArray(parsed.fixes) ? parsed.fixes : [])
      .filter((fx) => fx && typeof fx === 'object')
      .map((fx) => ({
        factor: validKeys.has(String(fx.factor)) ? String(fx.factor) : 'general',
        fix: String(fx.fix ?? '').slice(0, MAX_FIX_LEN),
      }))
      .filter((fx) => fx.fix.length > 0)
      .slice(0, MAX_FIXES)

    const summary = String(parsed.summary ?? '').slice(0, MAX_SUMMARY_LEN)

    const { data: scoreRow, error } = await supabase
      .from('virality_scores')
      .insert({
        blueprint_id: blueprintId,
        tier,
        overall_score: overall,
        factor_breakdown: factorBreakdown,
        attention_curve: attentionCurve,
        suggested_fixes: suggestedFixes,
        summary,
        enhancement_possible: enhanceable,
        model_version: modelUsed,
      })
      .select(
        'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
      )
      .single()

    if (error) {
      // 23505 = unique_violation. Two concurrent scorers raced past the
      // existence check on a Tier-1 insert (the partial unique index covers
      // tier=1 only). Re-read the row the other one inserted — match on
      // blueprint_id regardless of tier so the loser still gets the response.
      if (error.code === '23505') {
        const { data: raced } = await supabase
          .from('virality_scores')
          .select(
            'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
          )
          .eq('blueprint_id', blueprintId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (raced) {
          return NextResponse.json({
            score: raced,
            summary: raced.summary ?? '',
          })
        }
      }
      console.error('[studio:score] insert failed:', error.message)
      return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
    }

    return NextResponse.json({ score: scoreRow, summary })
  } catch (err: unknown) {
    console.error('[studio:score]', err)
    return NextResponse.json({ error: 'Scoring failed' }, { status: 500 })
  }
}
