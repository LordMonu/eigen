// lib/studio/rubric.ts — Virality scoring rubric. Single source of truth for
// factor keys, weights, and "strong" thresholds. The scorer system prompt
// reads from here (so weights surface to the model), and the route's
// computeOverall() uses the same weights server-side (the model never
// provides the overall — only per-factor scores).

export interface RubricFactor {
  key: string
  label: string
  weight: number       // 0–100; weights of a rubric should sum to 100
  description: string  // shown to the model in the scorer prompt
  strongThreshold: number  // below this → factor drags overall down, isEnhanceable() returns true
}

export const VIDEO_RUBRIC: RubricFactor[] = [
  {
    key: 'hook_strength',
    label: 'Hook (first 3s)',
    weight: 25,
    strongThreshold: 75,
    description: 'Does something arresting happen in the first 3 seconds? Pattern interrupt, curiosity gap, or immediate visual payoff.',
  },
  {
    key: 'emotional_trigger',
    label: 'Emotional trigger',
    weight: 20,
    strongThreshold: 70,
    description: 'Intensity of awe, humor, controversy, or relatability. Flat or predictable = low.',
  },
  {
    key: 'pacing_retention',
    label: 'Pacing & retention',
    weight: 15,
    strongThreshold: 70,
    description: 'Energy curve, cut rhythm, predicted attention drop points. Front-loaded beats slow-build for short-form.',
  },
  {
    key: 'trend_alignment',
    label: 'Trend alignment',
    weight: 15,
    strongThreshold: 65,
    description: 'Rides a current format, audio, or topic on the target platform.',
  },
  {
    key: 'payoff_clarity',
    label: 'Payoff clarity',
    weight: 10,
    strongThreshold: 70,
    description: 'Is there a satisfying, legible resolution that delivers on the hook?',
  },
  {
    key: 'shareability',
    label: 'Shareability',
    weight: 10,
    strongThreshold: 70,
    description: 'Concrete reason a viewer sends it to a friend — identity, utility, or "you have to see this".',
  },
  {
    key: 'loopability',
    label: 'Loop / rewatch',
    weight: 5,
    strongThreshold: 60,
    description: 'Does the end flow back to the start or reward a second watch, driving replays?',
  },
]

export const IMAGE_RUBRIC: RubricFactor[] = [
  {
    key: 'scroll_stop',
    label: 'Scroll-stopping',
    weight: 30,
    strongThreshold: 75,
    description: 'Visual hook strong enough to halt a thumb mid-scroll within 0.5 seconds.',
  },
  {
    key: 'subject_clarity',
    label: 'Subject clarity',
    weight: 20,
    strongThreshold: 70,
    description: 'Instantly legible focal subject — not cluttered or ambiguous.',
  },
  {
    key: 'aesthetic_pull',
    label: 'Aesthetic / emotion',
    weight: 20,
    strongThreshold: 70,
    description: 'Beauty, intrigue, or emotional pull that earns a like or save.',
  },
  {
    key: 'message_clarity',
    label: 'Message / text',
    weight: 15,
    strongThreshold: 65,
    description: 'If text overlay present: legible, punchy, well-placed. If none, judge the implied message.',
  },
  {
    key: 'composition',
    label: 'Composition / eye-flow',
    weight: 10,
    strongThreshold: 70,
    description: 'Eye-flow, focal hierarchy, and negative space for caption.',
  },
  {
    key: 'share_motivation',
    label: 'Share / save pull',
    weight: 5,
    strongThreshold: 60,
    description: 'Reason to save or send — aspirational, useful, or funny.',
  },
]

export type RubricKey =
  | (typeof VIDEO_RUBRIC)[number]['key']
  | (typeof IMAGE_RUBRIC)[number]['key']

/**
 * Compute the weighted overall from per-factor scores.
 * Server-side only — never trust a model-supplied overall.
 * Each factor weight is 0–100 (percent); weights of a rubric should sum to 100.
 */
export function computeOverall(
  factors: Record<string, number>,
  rubric: RubricFactor[],
): number {
  const total = rubric.reduce((sum, f) => {
    const score = factors[f.key] ?? 0
    return sum + (score * f.weight) / 100
  }, 0)
  return Math.round(total * 100) / 100
}

/**
 * True if the blueprint has headroom for the Enhance pass (Phase 3).
 * Either the overall is below 88, OR any single factor sits under its
 * strong threshold (so Enhance has a specific target to lift).
 */
export function isEnhanceable(
  factors: Record<string, number>,
  overall: number,
  rubric: RubricFactor[],
): boolean {
  if (overall < 88) return true
  return rubric.some((f) => (factors[f.key] ?? 0) < f.strongThreshold)
}
