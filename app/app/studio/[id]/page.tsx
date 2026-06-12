// app/app/studio/[id]/page.tsx — batch detail.
// Back link renders instantly; variants stream via Suspense.
import { Suspense } from 'react'
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Video, ImageIcon } from 'lucide-react'
import { VariantCard, type ScoreData } from '../variant-card'
import type { Outcome } from '../outcome-form'
import type { PromptSchema } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'

interface PageProps { params: Promise<{ id: string }> }

export default async function StudioBatchPage({ params }: PageProps) {
  const { id: batchId } = await params

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-8">
      <Link
        href="/app/studio"
        className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="size-4" />
        Back to Studio
      </Link>
      <Suspense fallback={<BatchSkeleton />}>
        <BatchContent batchId={batchId} />
      </Suspense>
    </div>
  )
}

async function BatchContent({ batchId }: { batchId: string }) {
  const membership = await requireActiveMembership()
  const supabase = await createClient()

  const { data: blueprints, error: blueprintsError } = await supabase
    .from('prompt_blueprints')
    .select(
      'id, media_type, brief, variant_label, schema_json, rendered_prompt, work_id, created_by, org_id, created_at',
    )
    .eq('batch_id', batchId)
    .order('created_at', { ascending: true })

  if (blueprintsError) {
    console.error('[studio:batch] query failed:', blueprintsError.message)
  }

  if (!blueprints || blueprints.length === 0) notFound()

  const batchOrgId = blueprints[0].org_id as string
  const blueprintIds = blueprints.map((b) => b.id)
  const totalInBatch = blueprints.length

  const [
    { data: scopedMembership },
    { data: works },
    { data: scoreRows, error: scoresError },
    { data: outcomeRows, error: outcomesError },
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('role')
      .eq('user_id', membership.user_id)
      .eq('org_id', batchOrgId)
      .eq('status', 'active')
      .maybeSingle(),
    supabase
      .from('works')
      .select('id, title, video_type')
      .eq('org_id', batchOrgId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('virality_scores')
      .select(
        'blueprint_id, overall_score, factor_breakdown, attention_curve, suggested_fixes, enhancement_possible, summary, tier, created_at',
      )
      .in('blueprint_id', blueprintIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('generation_outcomes')
      .select(
        'id, blueprint_id, platform, published_url, published_at, views, watch_time_avg_seconds, shares, saves, comments, likes, went_viral',
      )
      .in('blueprint_id', blueprintIds)
      .order('recorded_at', { ascending: false }),
  ])

  const role: Role = (scopedMembership?.role ?? membership.role) as Role

  const workOptions = (works ?? []).map((w) => ({
    id: w.id as string,
    label: (w.title as string) || (w.video_type as string) || 'Untitled',
  }))

  if (scoresError) {
    console.error('[studio:batch] scores query failed:', scoresError.message)
  }

  const scoreMap = new Map<string, ScoreData>()
  ;(scoreRows ?? []).forEach((s) => {
    if (!scoreMap.has(s.blueprint_id)) {
      scoreMap.set(s.blueprint_id, s as unknown as ScoreData)
    }
  })

  if (outcomesError) {
    console.error(
      '[studio:batch] outcomes query failed:',
      outcomesError.message,
    )
  }

  const outcomeMap = new Map<string, Outcome>()
  ;(outcomeRows ?? []).forEach((o) => {
    if (!outcomeMap.has(o.blueprint_id as string)) {
      outcomeMap.set(o.blueprint_id as string, o as unknown as Outcome)
    }
  })

  const brief = blueprints[0].brief
  const mediaType = blueprints[0].media_type as 'video' | 'image'
  const MediaIcon = mediaType === 'image' ? ImageIcon : Video

  return (
    <>
      {/* HERO BRIEF */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900 border border-neutral-800 px-2.5 py-0.5 text-neutral-300">
            <MediaIcon className="size-3" />
            <span className="capitalize">{mediaType}</span>
          </span>
          <span>·</span>
          <span>
            {blueprints.length} variant{blueprints.length === 1 ? '' : 's'}
          </span>
        </div>
        <h1 className="text-xl lg:text-2xl text-white leading-snug font-medium">
          {brief}
        </h1>
      </div>

      {/* VARIANTS */}
      <div className="space-y-6 pt-2">
        {blueprints.map((b, i) => {
          const canDelete =
            b.created_by === membership.user_id ||
            can(role, 'studio', 'delete')
          return (
            <VariantCard
              key={b.id}
              index={i + 1}
              blueprintId={b.id}
              label={b.variant_label || `Variant ${i + 1}`}
              renderedPrompt={b.rendered_prompt}
              schema={b.schema_json as PromptSchema}
              mediaType={b.media_type as 'video' | 'image'}
              score={scoreMap.get(b.id) ?? null}
              currentWorkId={(b.work_id as string | null) ?? null}
              works={workOptions}
              canDelete={canDelete}
              totalInBatch={totalInBatch}
              existingOutcome={outcomeMap.get(b.id) ?? null}
            />
          )
        })}
      </div>
    </>
  )
}

function BatchSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-5 w-32 rounded bg-neutral-900" />
        <div className="h-8 w-3/4 rounded bg-neutral-900" />
      </div>
      <div className="h-64 rounded-xl bg-neutral-900" />
      <div className="h-64 rounded-xl bg-neutral-900" />
    </div>
  )
}
