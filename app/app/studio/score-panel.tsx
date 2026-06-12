'use client'

// app/app/studio/score-panel.tsx — visual breakdown for one variant's score.
// Overall + per-factor bars + attention curve (video only) + collapsible fixes.
// Borderless / accent-led, no nested boxes — matches the Eigen aesthetic of
// the surrounding variant card.

import { useId, useState } from 'react'
import {
  ChevronRight,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Database,
} from 'lucide-react'
import { AttentionCurve } from './attention-curve'

interface FactorData {
  score: number
  note: string
  weight: number
  label: string
}

interface ScorePanelProps {
  overall: number
  factors: Record<string, FactorData>
  fixes: Array<{ factor: string; fix: string }>
  summary: string
  enhancementPossible: boolean
  attentionCurve: Array<{ second: number; retention: number }> | null
  mediaType: 'video' | 'image'
  /** 1 = generic Tier-1 rubric; 2 = Tier-2 calibrated against this org's
   *  historical outcomes. Old rows pre-Phase-6 with no tier value default
   *  to 1 in the caller. */
  tier: 1 | 2
}

// Unified threshold bands — both the text color and the bar fill use the same
// breakpoints so a "75" can never display as amber-number-on-lime-bar.
function scoreColor(n: number): string {
  if (n >= 80) return 'text-lime-400'
  if (n >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function barColor(n: number): string {
  if (n >= 80) return 'bg-lime-400'
  if (n >= 60) return 'bg-amber-400'
  return 'bg-red-500'
}

export function ScorePanel({
  overall,
  factors,
  fixes,
  summary,
  enhancementPossible,
  attentionCurve,
  mediaType,
  tier,
}: ScorePanelProps) {
  const [showFixes, setShowFixes] = useState(false)
  const fixesListId = useId()
  const fixCount = fixes?.length ?? 0

  // Sort factors by weight desc so the heaviest signal sits up top. A bad
  // score on a 25%-weight factor visually dominates a bad score on a 5%-er,
  // matching how the math actually treats them.
  const orderedFactors = Object.entries(factors).sort(
    ([, a], [, b]) => (b?.weight ?? 0) - (a?.weight ?? 0),
  )

  return (
    <div className="space-y-5">
      {/* OVERALL — large number + verdict, no box */}
      <div className="flex items-start gap-4">
        <div
          className={`shrink-0 text-5xl font-bold font-mono tabular-nums leading-none ${scoreColor(overall)}`}
        >
          {overall.toFixed(0)}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 mb-1">
            <Sparkles className="size-3" />
            <span>Viral score</span>
            {/* Tier badge — lime when retrieval-grounded against this org's
                outcomes (Tier 2), neutral when scored on the generic rubric
                (Tier 1). Sits between the eyebrow label and the "Already
                strong" pill so the user can read scoring provenance at a
                glance. */}
            <span
              className={
                tier === 2
                  ? 'inline-flex items-center gap-1 rounded-full bg-lime-400/10 border border-lime-400/30 px-2 py-0.5 text-[10px] text-lime-400 normal-case tracking-normal'
                  : 'inline-flex items-center gap-1 rounded-full bg-neutral-900 border border-neutral-800 px-2 py-0.5 text-[10px] text-neutral-500 normal-case tracking-normal'
              }
              title={
                tier === 2
                  ? 'Tier 2 — calibrated against your org’s recorded outcomes'
                  : 'Tier 1 — generic rubric (Tier 2 unlocks at 50 recorded outcomes)'
              }
            >
              <Database className="size-3" />
              {tier === 2 ? 'Tier 2 · your data' : 'Tier 1 · generic'}
            </span>
            {!enhancementPossible ? (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-lime-400/10 border border-lime-400/30 px-2 py-0.5 text-[10px] text-lime-400 normal-case tracking-normal">
                <CheckCircle2 className="size-3" />
                Already strong
              </span>
            ) : null}
          </div>
          {summary ? (
            <p className="text-sm text-neutral-300 leading-relaxed">{summary}</p>
          ) : null}
        </div>
      </div>

      {/* FACTOR BARS — sorted weight DESC */}
      <div className="space-y-2.5">
        {orderedFactors.map(([key, f]) => (
          <div key={key}>
            <div className="flex justify-between items-baseline text-xs mb-1">
              <span className="text-neutral-300">
                {f.label}
                <span className="text-neutral-600 text-[10px] ml-1">
                  · {f.weight}%
                </span>
              </span>
              <span className={`tabular-nums font-mono ${scoreColor(f.score)}`}>
                {f.score}
              </span>
            </div>
            <div className="h-1.5 bg-neutral-900 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor(f.score)}`}
                style={{ width: `${f.score}%` }}
              />
            </div>
            {f.note ? (
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                {f.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* ATTENTION CURVE — video only, never for images */}
      {mediaType === 'video' && attentionCurve && attentionCurve.length > 0 ? (
        <AttentionCurve data={attentionCurve} />
      ) : null}

      {/* SUGGESTED FIXES — collapsible */}
      {fixCount > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowFixes((v) => !v)}
            aria-expanded={showFixes}
            aria-controls={fixesListId}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight
              className={
                showFixes
                  ? 'size-3.5 rotate-90 transition-transform'
                  : 'size-3.5 transition-transform'
              }
            />
            <AlertTriangle className="size-3.5 text-amber-400" />
            {showFixes
              ? `Hide ${fixCount} suggested fix${fixCount > 1 ? 'es' : ''}`
              : `Show ${fixCount} suggested fix${fixCount > 1 ? 'es' : ''}`}
          </button>
          {showFixes ? (
            <ul id={fixesListId} className="mt-2 space-y-1.5">
              {fixes.map((fx, i) => {
                const label = factors[fx.factor]?.label ?? fx.factor
                return (
                  <li
                    key={`${fx.factor}-${i}`}
                    className="text-xs text-neutral-300 bg-neutral-900/50 rounded-xl px-3 py-2 leading-relaxed"
                  >
                    <span className="text-lime-400 font-medium">{label}:</span>{' '}
                    {fx.fix}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      ) : overall < 80 ? (
        <p className="text-xs text-neutral-500">
          No specific fixes — try regenerating with a more concrete brief.
        </p>
      ) : null}
    </div>
  )
}
