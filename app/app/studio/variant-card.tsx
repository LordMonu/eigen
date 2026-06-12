'use client'

// app/app/studio/variant-card.tsx — one variant: numbered left-edge accent
// stripe, score panel up top, copyable rendered prompt below, collapsible
// structured breakdown at the bottom.
//
// Score lifecycle:
//   - The server passes any existing score as `initialScore` (from virality_scores).
//   - If there's no score, the card auto-triggers POST /api/studio/score on mount,
//     guarded by hasScoredRef so React Strict Mode doesn't double-fire.
//   - The cleanup resets hasScoredRef ONLY when the cycle ended without a
//     score — so Strict Mode's synthetic unmount/remount doesn't deadlock
//     the spinner forever in dev.
//   - The fetch uses AbortController so an actual unmount mid-flight aborts
//     the HTTP request, not just discards its result.
//   - The route is itself idempotent (returns the existing score row if one
//     exists, backed by a partial unique index), so a Strict-Mode double
//     fire never produces duplicate score rows.

import { useState, useEffect, useId, useRef, useCallback } from 'react'
import { Check, Copy, ChevronRight, Loader2, RotateCw } from 'lucide-react'
import type { PromptSchema } from '@/lib/studio/schema'
import { ScorePanel } from './score-panel'
import { EnhanceButton } from './enhance-button'
import { AttachToWork } from './attach-to-work'
import { DeleteBlueprint } from './delete-blueprint'
import { OutcomeForm, type Outcome } from './outcome-form'

export interface WorkOption {
  id: string
  label: string
}

interface FactorData {
  score: number
  note: string
  weight: number
  label: string
}

export interface ScoreData {
  blueprint_id: string
  overall_score: number
  factor_breakdown: Record<string, FactorData>
  attention_curve: Array<{ second: number; retention: number }> | null
  suggested_fixes: Array<{ factor: string; fix: string }> | null
  enhancement_possible: boolean
  summary: string | null
  /** Phase 6 — 1 = generic rubric, 2 = retrieval-augmented. Score rows
   *  inserted before this phase have tier=1 in the DB (DEFAULT 1); any null
   *  that slips through is treated as 1 by the UI. */
  tier: number | null
}

interface VariantCardProps {
  index: number
  blueprintId: string
  label: string
  renderedPrompt: string
  schema: PromptSchema
  mediaType: 'video' | 'image'
  score: ScoreData | null
  // Phase 4 — attach + delete affordances
  currentWorkId: string | null
  works: WorkOption[]
  canDelete: boolean
  totalInBatch: number
  // Phase 5 — outcome capture (learning loop)
  existingOutcome: Outcome | null
}

function badgeScoreColor(n: number): string {
  if (n >= 80) return 'text-lime-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function ScoreSkeleton() {
  // Matches the shape of ScorePanel so the layout doesn't jump on resolution:
  // headline number block + summary lines + factor bars.
  return (
    <div className="space-y-5" aria-hidden="true">
      <div className="flex items-start gap-4">
        <div className="h-12 w-16 rounded bg-neutral-900 animate-pulse" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 w-24 rounded bg-neutral-900 animate-pulse" />
          <div className="h-3 w-full rounded bg-neutral-900 animate-pulse" />
          <div className="h-3 w-4/5 rounded bg-neutral-900 animate-pulse" />
        </div>
      </div>
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <div className="h-3 w-32 rounded bg-neutral-900 animate-pulse" />
              <div className="h-3 w-6 rounded bg-neutral-900 animate-pulse" />
            </div>
            <div className="h-1.5 w-full rounded-full bg-neutral-900 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function VariantCard({
  index,
  blueprintId,
  label,
  renderedPrompt,
  schema,
  mediaType,
  score: initialScore,
  currentWorkId,
  works,
  canDelete,
  totalInBatch,
  existingOutcome,
}: VariantCardProps) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  const [showSchema, setShowSchema] = useState(false)
  const [score, setScore] = useState<ScoreData | null>(initialScore)
  const [scoring, setScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  const hasScoredRef = useRef(false)
  const schemaPaneId = useId()

  const fetchScore = useCallback(
    async (signal?: AbortSignal) => {
      setScoring(true)
      setScoreError(null)
      try {
        const res = await fetch('/api/studio/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blueprintId }),
          signal,
        })
        const data = await res.json()
        if (signal?.aborted) return
        if (!res.ok) throw new Error(data.error || 'Scoring failed')
        setScore(data.score as ScoreData)
      } catch (err: unknown) {
        if (signal?.aborted) return
        // Re-enable retry on next mount or via the Retry button.
        hasScoredRef.current = false
        setScoreError(err instanceof Error ? err.message : 'Scoring failed')
      } finally {
        if (!signal?.aborted) setScoring(false)
      }
    },
    [blueprintId],
  )

  useEffect(() => {
    // If we already have a score (either from server or already fetched in
    // this session), don't fetch again.
    if (score || hasScoredRef.current) return
    hasScoredRef.current = true
    const ctrl = new AbortController()
    let finishedClean = false

    fetchScore(ctrl.signal).then(() => {
      finishedClean = true
    })

    return () => {
      ctrl.abort()
      // Strict Mode double-mount fix: if the cycle ended without a score
      // (cleanup before setScore landed), release the guard so the remount
      // can retry. Once a score is set, the `score` truthy check above
      // keeps us from re-firing anyway.
      if (!finishedClean) hasScoredRef.current = false
    }
    // hasScoredRef is the source of truth for "have we tried this card?".
    // Putting `score` in deps would cause the effect to re-run on every
    // setScore and the cleanup would falsely abort the just-completed run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blueprintId])

  function handleRetry() {
    setScoreError(null)
    hasScoredRef.current = true
    // Give the retry its own AbortController so navigating away while a
    // retry is in-flight cancels it cleanly (rather than calling setState
    // on an unmounted component, which is a no-op in React 18+ but noisy).
    const ctrl = new AbortController()
    fetchScore(ctrl.signal)
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(renderedPrompt)
      setCopied(true)
      setCopyError(false)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Permission denied or insecure context. Show a transient error near
      // the copy button — NOT in scoreError, which is reserved for scoring
      // failures and could be silently swallowed when a score is displayed.
      setCopied(false)
      setCopyError(true)
      setTimeout(() => setCopyError(false), 4000)
    }
  }

  return (
    <div className="group flex gap-4 items-stretch">
      {/* LEFT ACCENT STRIPE with the variant number */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-lime-400/10 border border-lime-400/30 text-lime-400 text-xs font-semibold font-mono">
          {index}
        </span>
        <div className="flex-1 w-px bg-gradient-to-b from-lime-400/30 via-neutral-800 to-transparent" />
      </div>

      {/* BODY */}
      <div className="flex-1 min-w-0 pb-2 space-y-4">
        {/* Title row — variant name, score badge, copy button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <h3 className="text-base font-semibold text-white leading-tight truncate min-w-0">
              {label}
            </h3>
            {score ? (
              <span
                className={`shrink-0 text-sm font-bold tabular-nums font-mono ${badgeScoreColor(score.overall_score)}`}
              >
                {score.overall_score.toFixed(0)}
              </span>
            ) : scoring ? (
              <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-neutral-500">
                <Loader2 className="size-3.5 animate-spin" />
                Scoring…
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              aria-label={copied ? 'Prompt copied' : 'Copy prompt to clipboard'}
              className={
                copyError
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-red-500/60 text-red-400 transition-colors'
                  : copied
                    ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-lime-400 text-black transition-colors'
                    : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-lime-400 hover:text-lime-400 transition-colors'
              }
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy prompt'}
            </button>
            {copyError ? (
              <p className="text-[10px] text-red-400 leading-tight">
                Copy failed — select &amp; copy manually
              </p>
            ) : null}
          </div>
          <span role="status" aria-live="polite" className="sr-only">
            {copied ? 'Prompt copied to clipboard' : copyError ? 'Copy failed. Please select and copy the text manually.' : ''}
          </span>
        </div>

        {/* META ROW — attach to work + delete. Sits between title and score
            panel so the title row stays clean / truncate-safe. */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <AttachToWork
            blueprintId={blueprintId}
            currentWorkId={currentWorkId}
            works={works}
          />
          {canDelete ? (
            <DeleteBlueprint
              blueprintId={blueprintId}
              totalInBatch={totalInBatch}
              variantLabel={label}
            />
          ) : null}
        </div>

        {/* SCORE PANEL / SKELETON / ERROR */}
        {score ? (
          <>
            <ScorePanel
              overall={score.overall_score}
              factors={score.factor_breakdown}
              fixes={score.suggested_fixes ?? []}
              summary={score.summary ?? ''}
              enhancementPossible={score.enhancement_possible}
              attentionCurve={score.attention_curve}
              mediaType={mediaType}
              // Coerce: pre-Phase-6 rows or anything that comes through as
              // something other than 2 falls back to Tier 1 in the UI.
              tier={score.tier === 2 ? 2 : 1}
            />
            <EnhanceButton
              blueprintId={blueprintId}
              score={score}
              mediaType={mediaType}
            />
          </>
        ) : scoring ? (
          <ScoreSkeleton />
        ) : scoreError ? (
          <div className="flex items-start gap-3">
            <p className="text-xs text-red-400 leading-relaxed flex-1">
              Couldn’t score this variant: {scoreError}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-lime-400 hover:text-lime-400 transition-colors shrink-0"
            >
              <RotateCw className="size-3.5" />
              Retry
            </button>
          </div>
        ) : null}

        {/* RENDERED PROMPT — subtle bg, no border */}
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Rendered prompt
          </p>
          <pre className="rounded-xl bg-neutral-900/60 p-4 text-sm text-neutral-200 whitespace-pre-wrap font-mono max-h-96 overflow-auto leading-relaxed">
            {renderedPrompt}
          </pre>
        </div>

        {/* SCHEMA TOGGLE */}
        <div>
          <button
            type="button"
            onClick={() => setShowSchema((v) => !v)}
            aria-expanded={showSchema}
            aria-controls={schemaPaneId}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-white transition-colors"
          >
            <ChevronRight
              className={
                showSchema
                  ? 'size-3.5 rotate-90 transition-transform'
                  : 'size-3.5 transition-transform'
              }
            />
            {showSchema ? 'Hide structured breakdown' : 'Show structured breakdown'}
          </button>
          {showSchema ? (
            <pre
              id={schemaPaneId}
              className="mt-2 rounded-xl bg-neutral-900/40 p-4 text-xs text-neutral-500 whitespace-pre-wrap font-mono max-h-80 overflow-auto"
            >
              {JSON.stringify(schema, null, 2)}
            </pre>
          ) : null}
        </div>

        {/* PHASE 5 — outcome capture. Sits at the very bottom of the card so
            the score / prompt remain the primary surfaces; recording is a
            post-publish action. */}
        <OutcomeForm
          blueprintId={blueprintId}
          existingOutcome={existingOutcome}
        />
      </div>
    </div>
  )
}
