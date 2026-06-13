import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import Link from 'next/link'
import { WorksView, type WorkRow, type WorkGenItem } from './works-view'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function ClientReportPage({ params, searchParams }: PageProps) {
  await requireRole(['master', 'manager'])
  const { id: clientId } = await params
  const sp = await searchParams
  const supabase = await createClient()

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  thirtyDaysAgo.setHours(0, 0, 0, 0)
  const fromDate = sp.from || thirtyDaysAgo.toISOString().split('T')[0]
  const toDate = sp.to || today.toISOString().split('T')[0]

  const [
    { data: client },
    { data: works },
    { data: memberships },
  ] = await Promise.all([
    supabase.from('clients').select('id, name').eq('id', clientId).maybeSingle(),
    supabase
      .from('works')
      .select('id, title, status, creator_id, video_type, start_date, end_date, max_credits')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    supabase.from('memberships').select('user_id, full_name').eq('status', 'active'),
  ])

  if (!client) {
    return <div className="p-6 text-neutral-400">Client not found.</div>
  }

  const workIds = (works || []).map((w) => w.id)
  const generations = workIds.length > 0
    ? await fetchAllRows((from, to) =>
        supabase
          .from('generations')
          .select('id, work_id, display_name, credits, is_waste, is_irrelevant, hf_created_at, assigned_at')
          .in('work_id', workIds)
          .gte('hf_created_at', `${fromDate}T00:00:00Z`)
          .lte('hf_created_at', `${toDate}T23:59:59Z`)
          .order('hf_created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      )
    : []

  const memberMap = new Map((memberships || []).map((m) => [m.user_id, m.full_name]))
  const reworkWorkIds = new Set((works || []).filter((w) => w.status === 'rework').map((w) => w.id))

  // Per-work aggregation
  interface WorkStats {
    usefulCredits: number
    wastageCredits: number
    reworkUsefulCredits: number
    reworkWastageCredits: number
    generationCount: number
    models: Map<string, number>   // ALL gens (waste + useful)
    generationsList: WorkGenItem[]
  }

  const workStats = new Map<string, WorkStats>()
  ;(works || []).forEach((w) => {
    workStats.set(w.id, {
      usefulCredits: 0,
      wastageCredits: 0,
      reworkUsefulCredits: 0,
      reworkWastageCredits: 0,
      generationCount: 0,
      models: new Map(),
      generationsList: [],
    })
  })

  ;(generations || []).forEach((g) => {
    if (!g.work_id) return
    if (g.is_irrelevant) return
    const stats = workStats.get(g.work_id)
    if (!stats) return
    const credits = parseFloat(g.credits || '0')
    const isRework = reworkWorkIds.has(g.work_id)
    stats.generationCount++

    // Track ALL models (waste + useful)
    stats.models.set(g.display_name, (stats.models.get(g.display_name) || 0) + credits)

    if (g.is_waste) {
      if (isRework) stats.reworkWastageCredits += credits
      else stats.wastageCredits += credits
    } else {
      if (isRework) stats.reworkUsefulCredits += credits
      else stats.usefulCredits += credits
    }

    stats.generationsList.push({
      id: g.id,
      modelName: g.display_name,
      credits,
      isWaste: g.is_waste,
      isRework,
      createdAt: g.hf_created_at,
      assignedAt: g.assigned_at ?? null,
    })
  })

  const rows: WorkRow[] = (works || []).map((w) => {
    const s = workStats.get(w.id)!
    return {
      id: w.id,
      title: w.title,
      status: w.status,
      creatorName: memberMap.get(w.creator_id) || 'Unknown',
      videoType: w.video_type,
      startDate: w.start_date,
      endDate: w.end_date,
      maxCredits: w.max_credits,
      usefulCredits: parseFloat(s.usefulCredits.toFixed(2)),
      wastageCredits: parseFloat(s.wastageCredits.toFixed(2)),
      reworkUsefulCredits: parseFloat(s.reworkUsefulCredits.toFixed(2)),
      reworkWastageCredits: parseFloat(s.reworkWastageCredits.toFixed(2)),
      generationCount: s.generationCount,
      models: Array.from(s.models.entries())
        .map(([name, cr]) => ({ name, credits: parseFloat(cr.toFixed(2)) }))
        .sort((a, b) => b.credits - a.credits),
      generationsList: s.generationsList,
    }
  })

  const backHref = `/app/reports?from=${fromDate}&to=${toDate}`

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {/* Header */}
      <div>
        <Link href={backHref} className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
          ← Back to Reports
        </Link>
        <h1 className="text-2xl font-bold text-white mt-2">{client.name}</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Works report · <span className="text-white">{fromDate}</span> to{' '}
          <span className="text-white">{toDate}</span>
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Total Works" value={String(rows.length)} />
        <Kpi
          label="Useful Credits"
          value={(rows.reduce((s, r) => s + r.usefulCredits + r.reworkUsefulCredits, 0)).toFixed(1)}
          color="lime"
        />
        <Kpi
          label="Wastage Credits"
          value={(rows.reduce((s, r) => s + r.wastageCredits + r.reworkWastageCredits, 0)).toFixed(1)}
          color="red"
        />
        <Kpi
          label="Generations"
          value={String(rows.reduce((s, r) => s + r.generationCount, 0))}
        />
      </div>

      {/* Works table */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Works</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Click any row for full detail — generations timeline, models, credits breakdown</p>
        </div>
        <WorksView rows={rows} clientName={client.name} />
      </section>
    </div>
  )
}

function Kpi({ label, value, color = 'white' }: { label: string; value: string; color?: 'white' | 'lime' | 'red' }) {
  const colorClass = color === 'lime' ? 'text-lime-400' : color === 'red' ? 'text-red-400' : 'text-white'
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
      <p className="text-neutral-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${colorClass} mt-1`}>{value}</p>
    </div>
  )
}
