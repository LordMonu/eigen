'use client'

// app/app/studio/enhance-button.tsx — Phase 3 Enhance pass.
//
// State machine:
//   idle           → button visible
//   loading        → button disabled, "Enhancing…" label
//   already_strong → small inline pill with reason (model said no, or fast path)
//   error          → red inline message + Retry returns to idle
//   done           → before/after panel with new score, change log, accept/keep
//
// On "Use enhanced": router.refresh() reloads the batch page. The enhanced
// blueprint shares batch_id with its parent, so it appears at the bottom of the
// list naturally (ordered by created_at ASC). The score panel for the new
// blueprint will hydrate from the server-fetched score map — no second LLM call.
//
// Why no auto-fetch on mount: enhance is creator-initiated and expensive (two
// LLM calls). It should never run without an explicit click.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  CheckCircle2,
  ArrowRight,
  RotateCw,
} from 'lucide-react'
import { ScorePanel } from './score-panel'
import type { PromptSchema } from '@/lib/studio/schema'
import type { ScoreData } from './variant-card'

interface EnhanceButtonProps {
  blueprintId: string
  score: ScoreData
  mediaType: 'video' | 'image'
}

interface EnhancedBlueprint {
  id: string
  rendered_prompt: string
  schema_json: PromptSchema
  variant_label: string
}

type State =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'already_strong'; reason: string }
  | { phase: 'error'; message: string }
  | {
      phase: 'done'
      previousOverall: number
      newBlueprint: EnhancedBlueprint
      newScore: ScoreData | null
      summary: string
      changeLog: string[]
      scoringFailed: boolean
    }

function deltaColor(delta: number): string {
  if (delta > 0) return 'text-lime-400'
  if (delta < 0) return 'text-red-400'
  return 'text-neutral-400'
}

export function EnhanceButton({
  blueprintId,
  score,
  mediaType,
}: EnhanceButtonProps) {
  const router = useRouter()
  const [state, setState] = useState<State>({ phase: 'idle' })
  const [isPending, startTransition] = useTransition()

  // Fast path — the score itself says nothing's to gain. Show the pill, no
  // button. (Mirrors the "Already strong" pill in ScorePanel.)
  if (!score.enhancement_possible && state.phase === 'idle') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 px-2.5 py-1 text-xs text-lime-400">
        <CheckCircle2 className="size-3" />
        Already strong — enhancement would not help
      </span>
    )
  }

  async function handleEnhance() {
    setState({ phase: 'loading' })
    try {
      const res = await fetch('/api/studio/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blueprintId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Enhance failed')

      if (!data.enhanced) {
        setState({
          phase: 'already_strong',
          reason: data.reason || 'Enhancement would not help.',
        })
        return
      }

      setState({
        phase: 'done',
        previousOverall: Number(data.previousOverall) || 0,
        newBlueprint: data.blueprint as EnhancedBlueprint,
        // data.score may be null if the inline scorer step failed AFTER the
        // child blueprint was persisted. In that case, the done panel shows
        // the change log + rendered prompt + a "scoring failed — refresh to
        // retry" hint, and skips the ScorePanel render.
        newScore: data.score ? (data.score as ScoreData) : null,
        summary: String(data.summary ?? ''),
        changeLog: Array.isArray(data.changeLog) ? data.changeLog : [],
        scoringFailed: Boolean(data.scoringFailed),
      })
    } catch (err: unknown) {
      setState({
        phase: 'error',
        message: err instanceof Error ? err.message : 'Enhance failed',
      })
    }
  }

  function handleUseEnhanced() {
    // Dismiss the before/after panel and reload the batch in a single
    // transition. Without the state reset, this card would permanently show
    // the "done" panel while the enhanced child appears at the bottom of the
    // batch — two cards rendering the same data. Resetting inside
    // startTransition pairs the panel collapse with the new card hydration.
    startTransition(() => {
      setState({ phase: 'idle' })
      router.refresh()
    })
  }

  function handleKeep() {
    setState({ phase: 'idle' })
  }

  function handleRetry() {
    setState({ phase: 'idle' })
  }

  // ----------- idle -----------
  if (state.phase === 'idle') {
    return (
      <button
        type="button"
        onClick={handleEnhance}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-lime-400 hover:text-lime-400 transition-colors"
      >
        <Sparkles className="size-3.5" />
        Enhance
      </button>
    )
  }

  // ----------- loading -----------
  if (state.phase === 'loading') {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed"
      >
        <Loader2 className="size-3.5 animate-spin" />
        Enhancing…
      </button>
    )
  }

  // ----------- already_strong (model verdict OR fast-path) -----------
  if (state.phase === 'already_strong') {
    return (
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 px-2.5 py-1 text-xs text-lime-400">
          <CheckCircle2 className="size-3 shrink-0" />
          <span className="leading-snug">{state.reason}</span>
        </span>
        <button
          type="button"
          onClick={handleRetry}
          className="text-xs text-neutral-500 hover:text-white transition-colors shrink-0"
        >
          Dismiss
        </button>
      </div>
    )
  }

  // ----------- error -----------
  if (state.phase === 'error') {
    return (
      <div className="flex items-start gap-3">
        <p className="text-xs text-red-400 leading-relaxed flex-1">
          Couldn’t enhance this variant: {state.message}
        </p>
        <button
          type="button"
          onClick={handleEnhance}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-lime-400 hover:text-lime-400 transition-colors shrink-0"
        >
          <RotateCw className="size-3.5" />
          Retry
        </button>
      </div>
    )
  }

  // ----------- done — before/after -----------
  // newScore may be null if the inline scorer step failed after the child
  // blueprint was persisted. We still render the change log + enhanced prompt,
  // but skip the score header + ScorePanel and show a "scoring failed" hint.
  const newScore = state.newScore
  const delta = newScore
    ? newScore.overall_score - state.previousOverall
    : 0
  const deltaStr = delta >= 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0)

  return (
    <div className="space-y-5 pt-4 mt-4 border-t border-neutral-800">
      {/* Header: Enhanced eyebrow + before/after numbers */}
      <div className="flex items-start gap-4">
        <Sparkles className="size-4 text-lime-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            Enhanced
          </p>
          {newScore ? (
            <div className="flex items-baseline gap-2 text-sm">
              <span className="text-neutral-500">Score</span>
              <span className="font-mono tabular-nums text-neutral-400">
                {state.previousOverall.toFixed(0)}
              </span>
              <ArrowRight className="size-3.5 text-neutral-600" />
              <span className="font-mono tabular-nums font-semibold text-white">
                {newScore.overall_score.toFixed(0)}
              </span>
              <span
                className={`font-mono tabular-nums font-semibold ${deltaColor(delta)}`}
              >
                ({deltaStr})
              </span>
            </div>
          ) : (
            <p className="text-xs text-amber-400 leading-relaxed">
              Scoring the enhanced version failed — apply it and refresh to
              auto-score on next view.
            </p>
          )}
        </div>
      </div>

      {/* Change log */}
      {state.changeLog.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-neutral-500">
            What changed
          </p>
          <ul className="space-y-1.5">
            {state.changeLog.map((c, i) => (
              <li
                key={i}
                className="text-xs text-neutral-300 bg-neutral-900/50 rounded-xl px-3 py-2 leading-relaxed"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* New score panel — only when the inline scorer step succeeded */}
      {newScore ? (
        <ScorePanel
          overall={newScore.overall_score}
          factors={newScore.factor_breakdown}
          fixes={newScore.suggested_fixes ?? []}
          summary={state.summary}
          enhancementPossible={newScore.enhancement_possible}
          attentionCurve={newScore.attention_curve}
          mediaType={mediaType}
          tier={newScore.tier === 2 ? 2 : 1}
        />
      ) : null}

      {/* Enhanced rendered prompt */}
      <div>
        <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
          Enhanced prompt
        </p>
        <pre className="rounded-xl bg-neutral-900/60 p-4 text-sm text-neutral-200 whitespace-pre-wrap font-mono max-h-72 overflow-auto leading-relaxed">
          {state.newBlueprint.rendered_prompt}
        </pre>
      </div>

      {/* Accept / keep */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleUseEnhanced}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-lime-400 text-black hover:bg-lime-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="size-3.5" />
          )}
          {isPending ? 'Loading…' : 'Use enhanced'}
        </button>
        <button
          type="button"
          onClick={handleKeep}
          disabled={isPending}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Keep original
        </button>
      </div>
    </div>
  )
}
