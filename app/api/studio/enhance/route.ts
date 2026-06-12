// app/api/studio/enhance/route.ts — Phase 3: improve one blueprint and re-score it.
//
// Flow:
//   1) Auth + read parent blueprint (RLS scopes to user's org).
//   2) Membership for the BLUEPRINT'S org → RBAC check for studio.create (a
//      successful enhance inserts a new child blueprint).
//   3) Load the latest score. Enhancement requires a score (Phase 2 auto-scores
//      on mount, so this should always succeed in practice).
//   4) Short-circuit if score.enhancement_possible === false. No LLM call.
//   5) Call enhancer. If it returns enhancement_applied: false, return that
//      verdict — no DB write, no second LLM call.
//   6) Otherwise: validate the returned schema's media_type matches the parent,
//      insert the child blueprint, re-score it inline, return both.
//
// Note: the plan's snippet imports from '@/lib/studio/claude' with
// callClaude/parseClaudeJson. The actual module is '@/lib/studio/llm' (OpenAI).
// This route uses the current names.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import {
  callLLM,
  parseLLMJson,
  ENHANCE_MODEL,
  SCORER_MODEL,
} from '@/lib/studio/llm'
import {
  enhancerSystemPrompt,
  scorerSystemPrompt,
} from '@/lib/studio/system-prompts'
import { renderPrompt } from '@/lib/studio/render-prompt'
import {
  VIDEO_RUBRIC,
  IMAGE_RUBRIC,
  computeOverall,
  isEnhanceable,
} from '@/lib/studio/rubric'
import type { MediaType, PromptSchema } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'
import { buildOutcomeContext } from '@/lib/studio/outcomes-context'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface EnhancerResponse {
  enhancement_applied: boolean
  reason?: string
  schema: PromptSchema | null
  change_log: string[]
}

interface FactorResult {
  score: number | string
  note: string
}

interface ScorerResponse {
  factors: Record<string, FactorResult>
  attention_curve: Array<{ second: number; retention: number }> | null
  summary: string
  fixes: Array<{ factor: string; fix: string }>
}

// Mirrors the defensive caps in the score route — a runaway model response
// shouldn't inflate a JSONB row or crash the renderer.
const MAX_NOTE_LEN = 500
const MAX_FIX_LEN = 1000
const MAX_SUMMARY_LEN = 4000
const MAX_REASON_LEN = 500
const MAX_CHANGE_LOG_ITEMS = 20
const MAX_CHANGE_LOG_LEN = 300
const MAX_FIXES = 20
const MAX_CURVE_POINTS = 600

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let body: { blueprintId?: string }
    try {
      body = (await req.json()) as { blueprintId?: string }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const blueprintId = body.blueprintId
    if (!blueprintId) {
      return NextResponse.json({ error: 'blueprintId required' }, { status: 400 })
    }

    // RLS gates this read to the user's org. .maybeSingle() returns null when
    // the blueprint sits outside the user's active orgs.
    const { data: blueprint, error: bpErr } = await supabase
      .from('prompt_blueprints')
      .select(
        'id, batch_id, media_type, brief, schema_json, org_id, work_id',
      )
      .eq('id', blueprintId)
      .maybeSingle()
    if (bpErr) {
      console.error('[studio:enhance] blueprint read failed:', bpErr.message)
      return NextResponse.json({ error: 'Enhance failed' }, { status: 500 })
    }
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    // RBAC scoped to THE BLUEPRINT'S org — same pattern as the score route.
    // Enhance creates a new child blueprint, so the right permission is create.
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
    if (!can(membership.role as Role, 'studio', 'create')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
    }

    // Latest tier-1 score on the parent. Phase 2 auto-scores on mount, so this
    // should be present — if it isn't, tell the client to score first.
    const { data: existingScore } = await supabase
      .from('virality_scores')
      .select(
        'overall_score, factor_breakdown, suggested_fixes, enhancement_possible',
      )
      .eq('blueprint_id', blueprintId)
      .eq('tier', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!existingScore) {
      return NextResponse.json(
        { error: 'Score this variant before enhancing it.' },
        { status: 400 },
      )
    }

    // Fast path: enhancement_possible was already computed at scoring time. If
    // every factor was at or above its strong threshold AND the overall ≥88,
    // skip the LLM call entirely.
    if (!existingScore.enhancement_possible) {
      return NextResponse.json({
        enhanced: false,
        reason:
          'This prompt is already strong — enhancement would not meaningfully lift its viral score.',
      })
    }

    const mediaType = blueprint.media_type as MediaType
    const rubric = mediaType === 'video' ? VIDEO_RUBRIC : IMAGE_RUBRIC

    const enhancerUser = [
      'CURRENT SCHEMA:',
      JSON.stringify(blueprint.schema_json, null, 2),
      '',
      'VIRALITY SCORE BREAKDOWN:',
      JSON.stringify(existingScore.factor_breakdown, null, 2),
      '',
      'FIXES TO APPLY:',
      JSON.stringify(existingScore.suggested_fixes ?? [], null, 2),
    ].join('\n')

    // Track the actual model used — callLLM falls back to gpt-4o-mini on
    // 5xx/429, and we want the real provenance on the inserted score row.
    let enhanceModelUsed = ENHANCE_MODEL
    const rawEnhance = await callLLM({
      system: enhancerSystemPrompt(mediaType),
      // A full video schema can run ~6-8k input tokens, fixes + breakdown
      // another ~2k, output is the full schema again ~6-8k. 12 000 covers it.
      maxTokens: 12000,
      jsonMode: true,
      model: ENHANCE_MODEL,
      user: enhancerUser,
      onModelUsed: (m) => {
        enhanceModelUsed = m
      },
    })

    const enhancerResult = parseLLMJson<EnhancerResponse>(rawEnhance)

    if (
      !enhancerResult.enhancement_applied ||
      !enhancerResult.schema ||
      typeof enhancerResult.schema !== 'object'
    ) {
      return NextResponse.json({
        enhanced: false,
        reason: String(
          enhancerResult.reason ??
            'Prompt is already optimised — no meaningful changes possible.',
        ).slice(0, MAX_REASON_LEN),
      })
    }

    // Validate the returned schema's media_type matches the parent. The
    // enhancer copying back the wrong media_type would crash renderPrompt and
    // would later confuse the scorer prompt. Belt-and-braces guard.
    if (enhancerResult.schema.media_type !== mediaType) {
      console.error(
        '[studio:enhance] schema media_type mismatch:',
        enhancerResult.schema.media_type,
        'vs',
        mediaType,
      )
      return NextResponse.json(
        { error: 'Enhancement produced an invalid schema' },
        { status: 502 },
      )
    }

    const renderedPrompt = renderPrompt(enhancerResult.schema)

    // Insert the enhanced child blueprint. Shares batch_id with the parent so
    // it appears at the bottom of the same batch page after router.refresh().
    const { data: newBlueprint, error: insertError } = await supabase
      .from('prompt_blueprints')
      .insert({
        org_id: blueprint.org_id,
        batch_id: blueprint.batch_id,
        work_id: blueprint.work_id,
        created_by: user.id,
        media_type: mediaType,
        brief: blueprint.brief,
        variant_label: 'Enhanced',
        parent_blueprint_id: blueprintId,
        schema_json: enhancerResult.schema,
        rendered_prompt: renderedPrompt,
        is_enhanced: true,
      })
      .select(
        'id, batch_id, media_type, brief, variant_label, schema_json, rendered_prompt, parent_blueprint_id, is_enhanced, created_at',
      )
      .single()

    if (insertError || !newBlueprint) {
      console.error(
        '[studio:enhance] blueprint insert failed:',
        insertError?.message,
      )
      return NextResponse.json({ error: 'Enhance failed' }, { status: 500 })
    }

    // ---- Inline re-score of the enhanced blueprint ----
    // Important: scorer failures here must NOT crash the route. The child
    // blueprint is already in the DB; if the scorer call or insert fails, we
    // surface enhanced: true with score: null + scoringFailed: true. The
    // client falls back to "showed the enhanced prompt but couldn't score it
    // — refresh to retry". Without this guard, the outer catch would 500 and
    // leave an orphan blueprint with no score and no user feedback.
    let scorerModelUsed = SCORER_MODEL
    let scoreRow: {
      blueprint_id: string
      overall_score: number
      factor_breakdown: Record<string, { score: number; note: string; weight: number; label: string }>
      attention_curve: Array<{ second: number; retention: number }> | null
      suggested_fixes: Array<{ factor: string; fix: string }>
      enhancement_possible: boolean
      summary: string
      tier: number
      created_at: string
    } | null = null
    let summary = ''
    let scoringFailed = false

    // Phase 6 — Tier-2 retrieval mirrors the score route. Computed outside
    // the try block so the tier value is in scope for the partial-failure
    // log line below. If context fetch fails, buildOutcomeContext returns
    // tier=1 + empty block.
    const { tier, contextBlock } = await buildOutcomeContext(
      supabase,
      blueprint.org_id,
      mediaType,
    )

    try {
      const rawScore = await callLLM({
        system: scorerSystemPrompt(mediaType, contextBlock || undefined),
        user: `PROMPT SCHEMA:\n${JSON.stringify(enhancerResult.schema, null, 2)}`,
        model: SCORER_MODEL,
        maxTokens: 8000,
        jsonMode: true,
        onModelUsed: (m) => {
          scorerModelUsed = m
        },
      })

      const parsedScore = parseLLMJson<ScorerResponse>(rawScore)

      // Mirror score/route.ts exactly: lenient numeric coercion, clamp, log on
      // missing/non-numeric so we notice when the model drifts.
      const factorScores: Record<string, number> = {}
      rubric.forEach((f) => {
        const rawF = parsedScore.factors?.[f.key]?.score
        const n =
          typeof rawF === 'number'
            ? rawF
            : typeof rawF === 'string'
              ? Number(rawF)
              : NaN
        if (!Number.isFinite(n)) {
          console.warn(
            `[studio:enhance] missing/non-numeric ${f.key} for enhanced ${newBlueprint.id}`,
          )
        }
        factorScores[f.key] = Math.max(
          0,
          Math.min(100, Math.round(Number.isFinite(n) ? n : 0)),
        )
      })

      const overall = computeOverall(factorScores, rubric)
      const enhanceable = isEnhanceable(factorScores, overall, rubric)

      const factorBreakdown: Record<
        string,
        { score: number; note: string; weight: number; label: string }
      > = {}
      rubric.forEach((f) => {
        factorBreakdown[f.key] = {
          score: factorScores[f.key],
          note: String(parsedScore.factors?.[f.key]?.note ?? '').slice(
            0,
            MAX_NOTE_LEN,
          ),
          weight: f.weight,
          label: f.label,
        }
      })

      const validKeys = new Set(rubric.map((r) => r.key))
      const attentionCurve =
        mediaType === 'video' && Array.isArray(parsedScore.attention_curve)
          ? parsedScore.attention_curve
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

      const suggestedFixes = (
        Array.isArray(parsedScore.fixes) ? parsedScore.fixes : []
      )
        .filter((fx) => fx && typeof fx === 'object')
        .map((fx) => ({
          factor: validKeys.has(String(fx.factor))
            ? String(fx.factor)
            : 'general',
          fix: String(fx.fix ?? '').slice(0, MAX_FIX_LEN),
        }))
        .filter((fx) => fx.fix.length > 0)
        .slice(0, MAX_FIXES)

      summary = String(parsedScore.summary ?? '').slice(0, MAX_SUMMARY_LEN)

      const { data: inserted, error: scoreErr } = await supabase
        .from('virality_scores')
        .insert({
          blueprint_id: newBlueprint.id,
          tier,
          overall_score: overall,
          factor_breakdown: factorBreakdown,
          attention_curve: attentionCurve,
          suggested_fixes: suggestedFixes,
          summary,
          enhancement_possible: enhanceable,
          model_version: scorerModelUsed,
        })
        .select(
          'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
        )
        .single()

      if (scoreErr || !inserted) {
        // The child blueprint already exists, but its score couldn't be
        // persisted. Don't 500 — surface enhanced: true, score: null so the
        // client can show the change log + rendered prompt and prompt the user
        // to refresh (the variant card auto-scores on next mount).
        console.error(
          '[studio:enhance] score insert failed:',
          scoreErr?.message,
        )
        scoringFailed = true
      } else {
        scoreRow = inserted
      }
    } catch (scoreErr: unknown) {
      // LLM call or JSON parse failed AFTER the child blueprint was already
      // inserted. Same treatment as DB insert failure — partial success.
      console.error(
        '[studio:enhance] scorer step failed (blueprint already persisted):',
        scoreErr instanceof Error ? scoreErr.message : scoreErr,
      )
      scoringFailed = true
    }

    // Coerce + cap the change log. An empty array is acceptable (UX shows the
    // before/after delta alone).
    const changeLog = (
      Array.isArray(enhancerResult.change_log) ? enhancerResult.change_log : []
    )
      .map((c) => String(c).slice(0, MAX_CHANGE_LOG_LEN))
      .filter((c) => c.length > 0)
      .slice(0, MAX_CHANGE_LOG_ITEMS)

    // Provenance log: we don't persist enhanceModelUsed on the parent blueprint,
    // but we do want it in server logs so post-mortem of weird enhancements is
    // possible.
    console.log(
      `[studio:enhance] blueprint ${newBlueprint.id} enhanced via ${enhanceModelUsed}, scored via ${scoreRow ? `${scorerModelUsed} (tier ${tier})` : 'NONE (scoring failed)'}`,
    )

    return NextResponse.json({
      enhanced: true,
      blueprint: newBlueprint,
      score: scoreRow,
      scoringFailed,
      summary,
      changeLog,
      previousOverall: existingScore.overall_score,
    })
  } catch (err: unknown) {
    console.error('[studio:enhance]', err)
    const msg = err instanceof Error ? err.message : 'Enhance failed'
    // Surface known user-facing errors verbatim (e.g. OPENAI_API_KEY missing);
    // everything else gets the generic message.
    const safe =
      msg.startsWith('OPENAI_API_KEY') || msg.includes('temporarily overloaded')
        ? msg
        : 'Enhance failed'
    return NextResponse.json({ error: safe }, { status: 500 })
  }
}
