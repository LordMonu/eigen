// app/app/reports/page.tsx — the north-star report (master/manager only).
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import Link from 'next/link'
import { DateRangeFilter } from './date-range-filter'
import { FilterSection, type ClientRow, type ModelRow, type VideoTypeRow, type IndustryRow, type WastageRow } from './filter-section'
import { ClientChart } from './client-chart'
import { CreatorChart } from './creator-chart'
import { ModelChart } from './model-chart'
import { TrendsChart } from './trends-chart'
import { GenerationsDrilldown } from './generations-drilldown'
import { ExportButton } from './export-button'
import { UserWastageChart } from './user-wastage-chart'
import { UserOntimeChart } from './user-ontime-chart'

interface PageProps {
  searchParams: Promise<{
    from?: string
    to?: string
    clientId?: string
    model?: string
    creatorId?: string
  }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const membership = await requireRole(['master', 'manager'])
  const params = await searchParams
  const supabase = await createClient()

  // Default range: last 30 days
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  thirtyDaysAgo.setHours(0, 0, 0, 0)

  const fromDate = params.from || thirtyDaysAgo.toISOString().split('T')[0]
  const toDate = params.to || today.toISOString().split('T')[0]

  const [generations, { data: clients }, { data: works }, { data: memberships }, { data: clientActivity }, { data: workActivity }] =
    await Promise.all([
      fetchAllRows((from, to) =>
        supabase
          .from('generations')
          .select(
            'id, display_name, result_url, media_type, credits, client_id, work_id, hf_created_at, assigned_by, is_waste, is_irrelevant, wasted_by'
          )
          .gte('hf_created_at', `${fromDate}T00:00:00Z`)
          .lte('hf_created_at', `${toDate}T23:59:59Z`)
          .order('hf_created_at', { ascending: false })
          .range(from, to)
      ),
      supabase.from('clients').select('id, name, industry'),
      supabase.from('works').select('id, title, video_type, creator_id, client_id, status, end_date, updated_at'),
      supabase
        .from('memberships')
        .select('user_id, full_name, role')
        .eq('status', 'active'),
      supabase
        .from('activity_log')
        .select('id, entity_id, action, from_value, to_value, actor_name, created_at')
        .eq('org_id', membership.org_id)
        .eq('entity_type', 'client')
        .gte('created_at', `${fromDate}T00:00:00Z`)
        .lte('created_at', `${toDate}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('activity_log')
        .select('id, entity_id, action, from_value, to_value, actor_name, created_at')
        .eq('org_id', membership.org_id)
        .eq('entity_type', 'work')
        .gte('created_at', `${fromDate}T00:00:00Z`)
        .lte('created_at', `${toDate}T23:59:59Z`)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientsTyped = (clients || []) as any[]
  const clientMap = new Map(clientsTyped.map((c) => [c.id as string, c.name as string]))
  const memberMap = new Map((memberships || []).map((m) => [m.user_id, m.full_name]))
  const workMap = new Map((works || []).map((w) => [w.id, w]))

  // ===== FILTER-SECTION DATA =====
  const reworkWorkIds = new Set((works || []).filter((w) => w.status === 'rework').map((w) => w.id))

  // — By Client —
  const clientRowMap = new Map<string, ClientRow>()
  clientsTyped.forEach((c) => {
    clientRowMap.set(c.id, {
      id: c.id,
      name: c.name,
      industry: (c.industry as string | null) ?? null,
      totalWorks: (works || []).filter((w) => w.client_id === c.id).length,
      usefulCredits: 0,
      wastageCredits: 0,
      reworkUsefulCredits: 0,
      reworkWastageCredits: 0,
      models: [],
    })
  })
  const clientModelMap = new Map<string, Map<string, number>>()
  ;(generations || []).forEach((g) => {
    if (!g.client_id) return
    if (g.is_irrelevant) return
    const row = clientRowMap.get(g.client_id)
    if (!row) return
    const credits = parseFloat(g.credits || '0')
    const isRework = g.work_id ? reworkWorkIds.has(g.work_id) : false
    // Track ALL models (waste + useful) for the pie chart
    if (!clientModelMap.has(g.client_id)) clientModelMap.set(g.client_id, new Map())
    const mm = clientModelMap.get(g.client_id)!
    mm.set(g.display_name, (mm.get(g.display_name) || 0) + credits)

    if (g.is_waste) {
      if (isRework) row.reworkWastageCredits += credits
      else row.wastageCredits += credits
    } else {
      if (isRework) row.reworkUsefulCredits += credits
      else row.usefulCredits += credits
    }
  })
  clientRowMap.forEach((row, cid) => {
    const mm = clientModelMap.get(cid)
    if (mm) {
      row.models = Array.from(mm.entries())
        .map(([name, cr]) => ({ name, credits: parseFloat(cr.toFixed(2)) }))
        .sort((a, b) => b.credits - a.credits)
    }
    row.usefulCredits = parseFloat(row.usefulCredits.toFixed(2))
    row.wastageCredits = parseFloat(row.wastageCredits.toFixed(2))
    row.reworkUsefulCredits = parseFloat(row.reworkUsefulCredits.toFixed(2))
    row.reworkWastageCredits = parseFloat(row.reworkWastageCredits.toFixed(2))
  })
  const filterClientData: ClientRow[] = Array.from(clientRowMap.values())
    .filter((r) => r.totalWorks > 0 || r.usefulCredits > 0 || r.wastageCredits > 0)
    .sort((a, b) => (b.usefulCredits + b.wastageCredits) - (a.usefulCredits + a.wastageCredits))

  // — By Model —
  const modelRowMap = new Map<string, { usefulCredits: number; wastageCredits: number }>()
  ;(generations || []).forEach((g) => {
    if (g.is_irrelevant) return
    const e = modelRowMap.get(g.display_name) || { usefulCredits: 0, wastageCredits: 0 }
    const credits = parseFloat(g.credits || '0')
    if (g.is_waste) e.wastageCredits += credits
    else e.usefulCredits += credits
    modelRowMap.set(g.display_name, e)
  })
  const filterModelData: ModelRow[] = Array.from(modelRowMap.entries())
    .map(([name, d]) => ({
      name,
      usefulCredits: parseFloat(d.usefulCredits.toFixed(2)),
      wastageCredits: parseFloat(d.wastageCredits.toFixed(2)),
    }))
    .sort((a, b) => b.usefulCredits - a.usefulCredits)

  // — By Video Type —
  const vtMap = new Map<string, { totalWorks: number; usefulCredits: number; wastageCredits: number }>()
  ;(works || []).forEach((w) => {
    const vt = w.video_type || 'Unspecified'
    const e = vtMap.get(vt) || { totalWorks: 0, usefulCredits: 0, wastageCredits: 0 }
    e.totalWorks++
    vtMap.set(vt, e)
  })
  ;(generations || []).forEach((g) => {
    if (!g.work_id) return
    if (g.is_irrelevant) return
    const w = workMap.get(g.work_id)
    if (!w) return
    const vt = w.video_type || 'Unspecified'
    const e = vtMap.get(vt) || { totalWorks: 0, usefulCredits: 0, wastageCredits: 0 }
    const credits = parseFloat(g.credits || '0')
    if (g.is_waste) e.wastageCredits += credits
    else e.usefulCredits += credits
    vtMap.set(vt, e)
  })
  const filterVideoTypeData: VideoTypeRow[] = Array.from(vtMap.entries())
    .map(([type, d]) => ({ type, ...d, usefulCredits: parseFloat(d.usefulCredits.toFixed(2)), wastageCredits: parseFloat(d.wastageCredits.toFixed(2)) }))
    .sort((a, b) => b.usefulCredits - a.usefulCredits)

  // — By Industry —
  const clientIndustryMap = new Map(
    clientsTyped.map((c) => [c.id as string, (c.industry as string | null) || 'Unspecified'])
  )
  const industryMap = new Map<string, { clients: Set<string>; totalWorks: number; usefulCredits: number; wastageCredits: number }>()
  clientsTyped.forEach((c) => {
    const ind = (c.industry as string | null) || 'Unspecified'
    const e = industryMap.get(ind) || { clients: new Set(), totalWorks: 0, usefulCredits: 0, wastageCredits: 0 }
    e.clients.add(c.id)
    industryMap.set(ind, e)
  })
  ;(works || []).forEach((w) => {
    if (!w.client_id) return
    const ind = clientIndustryMap.get(w.client_id) || 'Unspecified'
    const e = industryMap.get(ind) || { clients: new Set(), totalWorks: 0, usefulCredits: 0, wastageCredits: 0 }
    e.totalWorks++
    industryMap.set(ind, e)
  })
  ;(generations || []).forEach((g) => {
    if (!g.client_id) return
    if (g.is_irrelevant) return
    const ind = clientIndustryMap.get(g.client_id) || 'Unspecified'
    const e = industryMap.get(ind) || { clients: new Set(), totalWorks: 0, usefulCredits: 0, wastageCredits: 0 }
    const credits = parseFloat(g.credits || '0')
    if (g.is_waste) e.wastageCredits += credits
    else e.usefulCredits += credits
    industryMap.set(ind, e)
  })
  const filterIndustryData: IndustryRow[] = Array.from(industryMap.entries())
    .map(([industry, d]) => ({
      industry,
      totalClients: d.clients.size,
      totalWorks: d.totalWorks,
      usefulCredits: parseFloat(d.usefulCredits.toFixed(2)),
      wastageCredits: parseFloat(d.wastageCredits.toFixed(2)),
    }))
    .sort((a, b) => b.usefulCredits - a.usefulCredits)

  // — Wastage (all works, sorted by total wastage desc) —
  const wastageRowMap = new Map<string, WastageRow>()
  ;(works || []).forEach((w) => {
    wastageRowMap.set(w.id, {
      workId: w.id,
      workTitle: w.title,
      clientName: clientMap.get(w.client_id) || 'Unknown',
      status: w.status,
      usefulCredits: 0,
      wastageCredits: 0,
      reworkWastageCredits: 0,
      totalWastage: 0,
    })
  })
  ;(generations || []).forEach((g) => {
    if (!g.work_id) return
    if (g.is_irrelevant) return
    const row = wastageRowMap.get(g.work_id)
    if (!row) return
    const credits = parseFloat(g.credits || '0')
    const isRework = reworkWorkIds.has(g.work_id)
    if (g.is_waste) {
      if (isRework) row.reworkWastageCredits += credits
      else row.wastageCredits += credits
    } else {
      row.usefulCredits += credits
    }
  })
  const filterWastageData: WastageRow[] = Array.from(wastageRowMap.values())
    .map((r) => ({
      ...r,
      usefulCredits: parseFloat(r.usefulCredits.toFixed(2)),
      wastageCredits: parseFloat(r.wastageCredits.toFixed(2)),
      reworkWastageCredits: parseFloat(r.reworkWastageCredits.toFixed(2)),
      totalWastage: parseFloat((r.wastageCredits + r.reworkWastageCredits).toFixed(2)),
    }))
    .filter((r) => r.totalWastage > 0)
    .sort((a, b) => b.totalWastage - a.totalWastage)

  // ===== AGGREGATIONS =====
  const nonWasteGenerations = (generations || []).filter((g) => !g.is_waste && !g.is_irrelevant)
  const totalCredits = nonWasteGenerations.reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0
  )
  const totalGenerations = nonWasteGenerations.length

  // CLIENT-WISE
  const byClient = new Map<string, { name: string; credits: number; count: number }>()
  nonWasteGenerations.forEach((g) => {
    if (!g.client_id) return
    const existing = byClient.get(g.client_id) || {
      name: clientMap.get(g.client_id as string) || 'Unknown',
      credits: 0,
      count: 0,
    }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byClient.set(g.client_id, existing)
  })
  const clientData = Array.from(byClient.entries())
    .map(([id, d]) => ({
      id,
      name: d.name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
      percent:
        totalCredits > 0
          ? parseFloat(((d.credits / totalCredits) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.credits - a.credits)

  // CREATOR-WISE (via work join)
  const byCreator = new Map<string, { name: string; credits: number; count: number }>()
  nonWasteGenerations.forEach((g) => {
    if (!g.work_id) return
    const work = workMap.get(g.work_id)
    if (!work) return
    const existing = byCreator.get(work.creator_id) || {
      name: memberMap.get(work.creator_id) || 'Unknown',
      credits: 0,
      count: 0,
    }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byCreator.set(work.creator_id, existing)
  })
  const creatorData = Array.from(byCreator.entries())
    .map(([id, d]) => ({
      id,
      name: d.name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => b.credits - a.credits)

  // MODEL-WISE
  const byModel = new Map<string, { credits: number; count: number }>()
  nonWasteGenerations.forEach((g) => {
    const existing = byModel.get(g.display_name) || { credits: 0, count: 0 }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byModel.set(g.display_name, existing)
  })
  const modelData = Array.from(byModel.entries())
    .map(([name, d]) => ({
      name,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => b.credits - a.credits)

  // DAILY TREND
  const byDay = new Map<string, { credits: number; count: number }>()
  nonWasteGenerations.forEach((g) => {
    const day = g.hf_created_at.split('T')[0]
    const existing = byDay.get(day) || { credits: 0, count: 0 }
    existing.credits += parseFloat(g.credits || '0')
    existing.count++
    byDay.set(day, existing)
  })
  const trendData = Array.from(byDay.entries())
    .map(([date, d]) => ({
      date,
      credits: parseFloat(d.credits.toFixed(2)),
      count: d.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // ===== D1: USER REPORT =====
  const todayDate = new Date().toISOString().split('T')[0]
  const creators = (memberships || []).filter((m) => m.role === 'creator')

  const userReportData = creators.map((creator) => {
    // Credits assigned (by this user, non-waste)
    const assignedGens = nonWasteGenerations.filter(
      (g) => g.assigned_by === creator.user_id
    )
    const creditsAssigned = assignedGens.reduce(
      (s, g) => s + parseFloat(g.credits || '0'),
      0
    )

    // Wastage
    const wasteGens = (generations || []).filter(
      (g) => g.wasted_by === creator.user_id && g.is_waste
    )
    const wastageCredits = wasteGens.reduce(
      (s, g) => s + parseFloat(g.credits || '0'),
      0
    )

    // Works metrics
    const creatorWorks = (works || []).filter((w) => w.creator_id === creator.user_id)
    const completedWorks = creatorWorks.filter((w) => w.status === 'completed')
    const completedOnTime = completedWorks.filter((w) => {
      if (!w.end_date || !w.updated_at) return false
      return w.updated_at.split('T')[0] <= w.end_date
    })
    const missedDeadline = creatorWorks.filter((w) => {
      if (!w.end_date) return false
      return w.status !== 'completed' && w.end_date < todayDate
    })
    const activeWorks = creatorWorks.filter((w) => w.status !== 'completed')

    return {
      id: creator.user_id,
      name: creator.full_name,
      credits_assigned: parseFloat(creditsAssigned.toFixed(2)),
      wastage_count: wasteGens.length,
      wastage_credits: parseFloat(wastageCredits.toFixed(2)),
      completed_on_time: completedOnTime.length,
      deadline_missed: missedDeadline.length,
      completed_total: completedWorks.length,
      active_works: activeWorks.length,
    }
  })

  const userCsvData = userReportData.map((u) => ({
    Creator: u.name,
    'Credits Assigned': u.credits_assigned,
    'Wastage Count': u.wastage_count,
    'Wastage Credits': u.wastage_credits,
    'Completed On Time': u.completed_on_time,
    'Deadline Missed': u.deadline_missed,
    'Total Completed': u.completed_total,
    'Active Works': u.active_works,
  }))

  // DRILL-DOWN (filtered by url params)
  const filteredGenerations = nonWasteGenerations.filter((g) => {
    if (params.clientId && g.client_id !== params.clientId) return false
    if (params.model && g.display_name !== params.model) return false
    if (params.creatorId) {
      if (!g.work_id) return false
      const w = workMap.get(g.work_id)
      if (!w || w.creator_id !== params.creatorId) return false
    }
    return true
  })

  const csvData = clientData.map((c) => ({
    Client: c.name,
    Credits: c.credits,
    'Percent of Total': c.percent + '%',
    Generations: c.count,
  }))

  const uniqueModels = Array.from(
    new Set(nonWasteGenerations.map((g) => g.display_name))
  )

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      {/* HEADER + DATE FILTER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Credit usage from <span className="text-white">{fromDate}</span> to{' '}
            <span className="text-white">{toDate}</span>
          </p>
        </div>
        <DateRangeFilter
          key={`${fromDate}-${toDate}`}
          fromDate={fromDate}
          toDate={toDate}
        />
      </div>

      {/* KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          label="Total Credits"
          value={totalCredits.toFixed(1)}
          subtext="in selected period"
          color="white"
        />
        <KpiCard
          label="Generations"
          value={totalGenerations.toString()}
          subtext="all models"
          color="white"
        />
        <KpiCard
          label="Top Client"
          value={clientData[0]?.name || '—'}
          subtext={`${(clientData[0]?.credits || 0).toFixed(1)} credits`}
          color="lime"
        />
        <KpiCard
          label="Top Model"
          value={modelData[0]?.name || '—'}
          subtext={`${(modelData[0]?.credits || 0).toFixed(1)} credits`}
          color="orange"
        />
      </div>

      {/* FILTER TABLES */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Drill-Down Analysis</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Filter by client, model, video type, or industry
          </p>
        </div>
        <FilterSection
          clients={filterClientData}
          models={filterModelData}
          videoTypes={filterVideoTypeData}
          industries={filterIndustryData}
          wastage={filterWastageData}
          fromDate={fromDate}
          toDate={toDate}
        />
      </section>

      {/* ★ CLIENT-WISE — THE NORTH STAR ★ */}
      <section className="bg-neutral-950 border border-lime-900/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white text-lg">
              ★ Client-Wise Credit Usage
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {clientData.length} clients with credit attribution in this period
            </p>
          </div>
          <ExportButton
            filename={`client-report-${fromDate}-to-${toDate}.csv`}
            data={csvData}
          />
        </div>
        {clientData.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <p>No credits assigned to clients in this period.</p>
            <p className="text-xs mt-1">
              Try a wider date range or assign generations in /app/sync.
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 p-4">
            <ClientChart data={clientData.slice(0, 10)} />
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2">Client</th>
                    <th className="text-right py-2">Credits</th>
                    <th className="text-right py-2">%</th>
                    <th className="text-right py-2 pr-2">Gens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {clientData.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-900/40">
                      <td className="py-2 pl-2 text-white">
                        <Link
                          href={`/app/clients/${row.id}`}
                          className="hover:text-lime-400 hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="py-2 text-right text-orange-400 font-bold">
                        {row.credits.toFixed(1)}
                      </td>
                      <td className="py-2 text-right text-neutral-400">
                        {row.percent.toFixed(0)}%
                      </td>
                      <td className="py-2 text-right pr-2 text-neutral-400">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-neutral-700">
                  <tr>
                    <td className="py-2 pl-2 text-neutral-400 font-medium">
                      Total
                    </td>
                    <td className="py-2 text-right text-white font-bold">
                      {clientData.reduce((s, r) => s + r.credits, 0).toFixed(1)}
                    </td>
                    <td className="py-2 text-right text-neutral-500">100%</td>
                    <td className="py-2 text-right pr-2 text-neutral-400">
                      {clientData.reduce((s, r) => s + r.count, 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ★ USER REPORT ★ */}
      <section className="bg-neutral-950 border border-purple-900/50 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white text-lg">
              ★ User Report
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Per-creator performance metrics
            </p>
          </div>
          <ExportButton
            filename={`user-report-${fromDate}-to-${toDate}.csv`}
            data={userCsvData}
          />
        </div>
        {userReportData.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            No creators found.
          </div>
        ) : (
          <>
            {/* Summary table */}
            <div className="overflow-auto p-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2">Creator</th>
                    <th className="text-right py-2">Credits Assigned</th>
                    <th className="text-right py-2">Wastage</th>
                    <th className="text-right py-2">Waste Cr.</th>
                    <th className="text-right py-2">On Time</th>
                    <th className="text-right py-2">Missed</th>
                    <th className="text-right py-2">Completed</th>
                    <th className="text-right py-2 pr-2">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {userReportData.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-900/40">
                      <td className="py-2 pl-2 text-white font-medium">
                        {row.name}
                      </td>
                      <td className="py-2 text-right text-orange-400 font-bold">
                        {row.credits_assigned.toFixed(1)}
                      </td>
                      <td className="py-2 text-right text-neutral-400">
                        {row.wastage_count}
                      </td>
                      <td className="py-2 text-right text-red-400">
                        {row.wastage_credits > 0
                          ? row.wastage_credits.toFixed(1)
                          : '—'}
                      </td>
                      <td className="py-2 text-right text-green-400">
                        {row.completed_on_time}
                      </td>
                      <td className="py-2 text-right text-red-400">
                        {row.deadline_missed || '—'}
                      </td>
                      <td className="py-2 text-right text-neutral-300">
                        {row.completed_total}
                      </td>
                      <td className="py-2 text-right pr-2 text-neutral-400">
                        {row.active_works}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-4 p-4 pt-0">
              <div>
                <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                  Credits Assigned per Creator
                </h3>
                <CreatorChart
                  data={userReportData.map((u) => ({
                    id: u.id,
                    name: u.name,
                    credits: u.credits_assigned,
                    count: 0,
                  }))}
                />
              </div>
              <div>
                <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                  Wastage per Creator
                </h3>
                <UserWastageChart
                  data={userReportData
                    .filter((u) => u.wastage_credits > 0)
                    .map((u) => ({
                      name: u.name,
                      wastage_credits: u.wastage_credits,
                    }))}
                />
              </div>
            </div>
            <div className="p-4 pt-0">
              <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                On Time vs Missed Deadlines
              </h3>
              <UserOntimeChart
                data={userReportData
                  .filter((u) => u.completed_on_time > 0 || u.deadline_missed > 0)
                  .map((u) => ({
                    name: u.name,
                    on_time: u.completed_on_time,
                    missed: u.deadline_missed,
                  }))}
              />
            </div>
          </>
        )}
      </section>

      {/* CREATOR-WISE */}
      {creatorData.length > 0 && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white">Creator-Wise Credit Usage</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Credits attributed via work assignments
            </p>
          </div>
          <div className="p-4">
            <CreatorChart data={creatorData} />
          </div>
        </section>
      )}

      {/* MODEL BREAKDOWN */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Credits by Model</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Which models burn the most credits
          </p>
        </div>
        {modelData.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            No generations in this period.
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 p-4">
            <ModelChart data={modelData.filter((d) => d.credits > 0)} />
            <div className="overflow-auto max-h-80">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2">Model</th>
                    <th className="text-right py-2">Credits</th>
                    <th className="text-right py-2 pr-2">Gens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {modelData.map((row) => (
                    <tr key={row.name}>
                      <td className="py-2 pl-2 text-white">{row.name}</td>
                      <td
                        className={`py-2 text-right font-bold ${row.credits > 0 ? 'text-orange-400' : 'text-neutral-600'}`}
                      >
                        {row.credits > 0 ? row.credits.toFixed(1) : 'free'}
                      </td>
                      <td className="py-2 text-right pr-2 text-neutral-400">
                        {row.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* DAILY TREND */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Daily Credit Usage</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Credits spent per day in this period
          </p>
        </div>
        <div className="p-4">
          {trendData.length === 0 ? (
            <div className="text-center text-neutral-500 py-8">No data.</div>
          ) : (
            <TrendsChart data={trendData} />
          )}
        </div>
      </section>

      {/* CLIENT ACTIVITY LOG */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Client Activity</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Status changes, edits, creations and deletions for clients in this period
          </p>
        </div>
        {!clientActivity || clientActivity.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">No client activity in this period.</div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-950">
                <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                  <th className="text-left py-2 pl-4">Client</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Detail</th>
                  <th className="text-left py-2">By</th>
                  <th className="text-right py-2 pr-4">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {clientActivity.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-900/30">
                    <td className="py-2 pl-4 text-white font-medium">
                      {clientMap.get(e.entity_id) || <span className="text-neutral-600 italic">deleted</span>}
                    </td>
                    <td className="py-2"><ActivityBadge action={e.action} /></td>
                    <td className="py-2 text-neutral-400 text-xs">
                      {e.from_value && e.to_value ? (
                        <><span className="line-through text-neutral-600">{e.from_value.replace(/_/g, ' ')}</span>{' → '}<span className="text-neutral-300">{e.to_value.replace(/_/g, ' ')}</span></>
                      ) : e.to_value ? (
                        <span className="text-neutral-300">{e.to_value.replace(/_/g, ' ')}</span>
                      ) : e.from_value ? (
                        <span className="text-neutral-600">{e.from_value.replace(/_/g, ' ')}</span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-neutral-400 text-xs">{e.actor_name}</td>
                    <td className="py-2 pr-4 text-right text-neutral-600 text-xs whitespace-nowrap">{formatLogDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* WORK ACTIVITY LOG */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">Work Activity</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Status changes, assignments, wastage, edits and deletions for works in this period
          </p>
        </div>
        {!workActivity || workActivity.length === 0 ? (
          <div className="p-8 text-center text-neutral-500 text-sm">No work activity in this period.</div>
        ) : (
          <div className="overflow-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-950">
                <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                  <th className="text-left py-2 pl-4">Work</th>
                  <th className="text-left py-2">Action</th>
                  <th className="text-left py-2">Detail</th>
                  <th className="text-left py-2">By</th>
                  <th className="text-right py-2 pr-4">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {workActivity.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-900/30">
                    <td className="py-2 pl-4 text-white font-medium">
                      {workMap.get(e.entity_id)?.title || <span className="text-neutral-600 italic">deleted</span>}
                    </td>
                    <td className="py-2"><ActivityBadge action={e.action} /></td>
                    <td className="py-2 text-neutral-400 text-xs max-w-xs truncate">
                      {e.from_value && e.to_value ? (
                        <><span className="line-through text-neutral-600">{e.from_value.replace(/_/g, ' ')}</span>{' → '}<span className="text-neutral-300">{e.to_value.replace(/_/g, ' ')}</span></>
                      ) : e.to_value ? (
                        <span className="text-neutral-300">{e.to_value.replace(/_/g, ' ')}</span>
                      ) : e.from_value ? (
                        <span className="text-neutral-600">{e.from_value.replace(/_/g, ' ')}</span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-neutral-400 text-xs">{e.actor_name}</td>
                    <td className="py-2 pr-4 text-right text-neutral-600 text-xs whitespace-nowrap">{formatLogDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* DRILL-DOWN GENERATIONS */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">All Generations in Period</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {filteredGenerations.length}{' '}
            {filteredGenerations.length === 1 ? 'generation' : 'generations'} —
            drill down with filters
          </p>
        </div>
        <GenerationsDrilldown
          generations={filteredGenerations.map((g) => ({
            id: g.id,
            display_name: g.display_name,
            result_url: g.result_url,
            media_type: g.media_type,
            credits: parseFloat(g.credits || '0'),
            hf_created_at: g.hf_created_at,
            client_name: g.client_id
              ? clientMap.get(g.client_id) || 'Unknown'
              : 'Unassigned',
            creator_name: g.work_id
              ? memberMap.get(workMap.get(g.work_id)?.creator_id || '') ||
                'Unknown'
              : '—',
          }))}
          clients={clients || []}
          memberships={memberships || []}
          models={uniqueModels}
          activeFilters={{
            clientId: params.clientId,
            model: params.model,
            creatorId: params.creatorId,
          }}
          fromDate={fromDate}
          toDate={toDate}
        />
      </section>
    </div>
  )
}

function formatLogDate(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  )
}

const ACTION_COLORS: Record<string, string> = {
  created: 'text-green-400 bg-green-950/50',
  status_changed: 'text-blue-400 bg-blue-950/50',
  edited: 'text-yellow-400 bg-yellow-950/50',
  archived: 'text-neutral-400 bg-neutral-800/60',
  assigned: 'text-lime-400 bg-lime-950/50',
  unassigned: 'text-orange-400 bg-orange-950/50',
  wastage: 'text-red-400 bg-red-950/50',
  unwastage: 'text-teal-400 bg-teal-950/50',
}

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  status_changed: 'Status',
  edited: 'Edited',
  archived: 'Archived',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  wastage: 'Wastage',
  unwastage: 'Useful',
}

function ActivityBadge({ action }: { action: string }) {
  const color = ACTION_COLORS[action] ?? 'text-neutral-400 bg-neutral-800/60'
  const label = ACTION_LABELS[action] ?? action
  return (
    <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${color}`}>
      {label}
    </span>
  )
}

function KpiCard({
  label,
  value,
  subtext,
  color,
}: {
  label: string
  value: string
  subtext: string
  color: 'white' | 'lime' | 'orange'
}) {
  const colors = {
    white: 'text-white',
    lime: 'text-lime-400',
    orange: 'text-orange-400',
  }
  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4">
      <p className="text-neutral-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${colors[color]} mt-1 truncate`}>
        {value}
      </p>
      <p className="text-neutral-500 text-xs mt-1">{subtext}</p>
    </div>
  )
}
