// app/app/studio/page.tsx — Studio home.
// Hero + BriefForm render immediately; only Recent briefs (API data) streams via Suspense.
import { Suspense } from 'react'
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import Link from 'next/link'
import { Video, ImageIcon, ArrowUpRight, Sparkles, Database } from 'lucide-react'
import { BriefForm } from './brief-form'

export default async function StudioPage() {
  // Fetch the small works list synchronously so the BriefForm shows up instantly
  // with its dropdown populated. This is a single fast query.
  const supabase = await createClient()
  const { data: works } = await supabase
    .from('works')
    .select('id, title, video_type')
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-10">
      {/* HERO */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-lime-400/10 border border-lime-400/30 px-3 py-1 text-xs text-lime-400">
          <Sparkles className="size-3.5" />
          <span>Prompt Architect</span>
        </div>
        <h1 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
          Turn a brief into a director-grade prompt
        </h1>
        <p className="text-neutral-400 text-sm max-w-2xl">
          Describe your idea — Studio drafts 2–3 distinct variants, each with the
          full structured direction (subjects, scenes, lighting, audio). Copy the
          winner into Higgsfield.
        </p>
      </div>

      {/* TIER-2 INDICATOR — streams in once outcome count loads */}
      <Suspense fallback={null}>
        <TierIndicator />
      </Suspense>

      {/* BRIEF FORM — renders instantly, no shimmer */}
      <BriefForm
        works={(works ?? []).map((w) => ({
          id: w.id,
          label: w.title || w.video_type || 'Untitled',
        }))}
      />

      {/* RECENT BRIEFS — only this needs shimmer while API loads */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-300">Recent briefs</h2>
        </div>
        <Suspense fallback={<RecentBriefsSkeleton />}>
          <RecentBriefs />
        </Suspense>
      </section>
    </div>
  )
}

async function TierIndicator() {
  const membership = await requireActiveMembership()
  const supabase = await createClient()

  const { count: outcomeCount } = await supabase
    .from('generation_outcomes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', membership.org_id)

  const TIER2_THRESHOLD = 50
  const outcomeCountSafe = typeof outcomeCount === 'number' ? outcomeCount : 0
  const tier2Active = outcomeCountSafe >= TIER2_THRESHOLD

  if (outcomeCountSafe === 0) return null

  return (
    <div className="-mt-8">
      {tier2Active ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-lime-400/10 border border-lime-400/30 px-2.5 py-1 text-xs text-lime-400"
          title="Tier-2 scoring is active: the scorer is calibrating against your org's recorded outcomes."
        >
          <Database className="size-3" />
          Tier 2 active ·{' '}
          <span className="font-mono tabular-nums">{outcomeCountSafe}</span>{' '}
          outcomes
        </span>
      ) : (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 border border-neutral-800 px-2.5 py-1 text-xs text-neutral-400"
          title="Tier-2 scoring unlocks once you have 50 recorded outcomes — until then the scorer uses a generic rubric."
        >
          <Database className="size-3 text-neutral-500" />
          <span className="font-mono tabular-nums text-neutral-300">
            {outcomeCountSafe}
          </span>
          /{TIER2_THRESHOLD} outcomes ·{' '}
          <span className="text-neutral-500">
            Tier-2 unlocks at {TIER2_THRESHOLD}
          </span>
        </span>
      )}
    </div>
  )
}

async function RecentBriefs() {
  const supabase = await createClient()

  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select('id, batch_id, media_type, brief, variant_label, created_at')
    .order('created_at', { ascending: false })
    .limit(60)

  if (blueprintsError) {
    console.error('[studio] prompt_blueprints query failed:', blueprintsError.message)
  }

  const allBlueprintIds = (blueprints ?? []).map((b) => b.id)
  const { data: allScores } = allBlueprintIds.length
    ? await supabase
        .from('virality_scores')
        .select('blueprint_id, overall_score')
        .in('blueprint_id', allBlueprintIds)
    : { data: [] as Array<{ blueprint_id: string; overall_score: number }> }

  const scoreByBlueprint = new Map<string, number>()
  ;(allScores ?? []).forEach((s) => {
    scoreByBlueprint.set(s.blueprint_id, Number(s.overall_score))
  })

  const batchMeta = new Map<
    string,
    { count: number; bestScore: number | null }
  >()
  ;(blueprints ?? []).forEach((b) => {
    const existing = batchMeta.get(b.batch_id) ?? {
      count: 0,
      bestScore: null,
    }
    const s = scoreByBlueprint.get(b.id) ?? null
    batchMeta.set(b.batch_id, {
      count: existing.count + 1,
      bestScore:
        s !== null && (existing.bestScore === null || s > existing.bestScore)
          ? s
          : existing.bestScore,
    })
  })

  const seen = new Set<string>()
  const batches = (blueprints ?? []).filter((b) => {
    if (seen.has(b.batch_id)) return false
    seen.add(b.batch_id)
    return true
  })

  if (batches.length === 0) {
    return (
      <p className="text-sm text-neutral-500 py-4">
        Nothing yet. Write a brief above to generate your first prompts.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-900">
      {batches.map((b) => {
        const Icon = b.media_type === 'image' ? ImageIcon : Video
        const meta = batchMeta.get(b.batch_id) ?? {
          count: 1,
          bestScore: null,
        }
        const best =
          meta.bestScore !== null && Number.isFinite(meta.bestScore)
            ? meta.bestScore
            : null
        const scoreCls =
          best === null
            ? 'text-neutral-600'
            : best >= 80
              ? 'text-lime-400'
              : best >= 60
                ? 'text-amber-400'
                : 'text-red-400'
        return (
          <li key={b.batch_id}>
            <Link
              href={`/app/studio/${b.batch_id}`}
              className="group flex items-center gap-4 py-3 hover:bg-neutral-900/30 -mx-3 px-3 rounded-lg transition-colors"
            >
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-neutral-900 text-neutral-400 group-hover:text-lime-400 transition-colors">
                <Icon className="size-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate group-hover:text-lime-400 transition-colors">
                  {b.brief}
                </p>
                <p className="text-xs text-neutral-500 mt-0.5 capitalize">
                  {b.media_type} ·{' '}
                  {meta.count} variant{meta.count === 1 ? '' : 's'} ·{' '}
                  {new Date(b.created_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
              {best !== null ? (
                <span
                  className={`text-sm font-bold font-mono tabular-nums shrink-0 ${scoreCls}`}
                  title={`Best score in batch: ${best.toFixed(0)}`}
                >
                  {best.toFixed(0)}
                </span>
              ) : null}
              <ArrowUpRight className="size-4 text-neutral-600 group-hover:text-lime-400 transition-colors shrink-0" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function RecentBriefsSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-14 rounded-lg bg-neutral-900" />
      <div className="h-14 rounded-lg bg-neutral-900" />
      <div className="h-14 rounded-lg bg-neutral-900" />
    </div>
  )
}
