// app/app/reports/page.tsx — the north-star report (master/manager only).
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import {
  buildFilterExtras,
  fetchReportAnalytics,
  withClientPercents,
  type ReportGenerationRow,
} from '@/lib/report-analytics-server'
import Link from 'next/link'
import { DateRangeFilter } from './date-range-filter'
import { FilterSection } from './filter-section'
import { ClientChart } from './client-chart'
import { CreatorChart } from './creator-chart'
import { ModelChart } from './model-chart'
import { TrendsChart } from './trends-chart'
import { ExportButton } from './export-button'
import { UserWastageChart } from './user-wastage-chart'
import { UserOntimeChart } from './user-ontime-chart'

interface PageProps {
  searchParams: Promise<{
    from?: string
    to?: string
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

  const fromIso = `${fromDate}T00:00:00Z`
  const toIso = `${toDate}T23:59:59Z`

  const [
    analytics,
    { data: clients },
    { data: works },
    { data: memberships },
    { data: clientActivity },
    { data: workActivity },
  ] = await Promise.all([
    fetchReportAnalytics(supabase, fromDate, toDate),
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
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('activity_log')
      .select('id, entity_id, action, from_value, to_value, actor_name, created_at')
      .eq('org_id', membership.org_id)
      .eq('entity_type', 'work')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false })
      .limit(200),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientsTyped = (clients || []) as any[]
  const clientMap = new Map(clientsTyped.map((c) => [c.id as string, c.name as string]))
  const memberMap = new Map((memberships || []).map((m) => [m.user_id, m.full_name]))
  const workMap = new Map((works || []).map((w) => [w.id, w]))

  let totalCredits: number
  let totalGenerations: number
  let clientData: ReturnType<typeof withClientPercents>
  let creatorData: Array<{ id: string; name: string; credits: number; count: number }>
  let modelData: Array<{ name: string; credits: number; count: number }>
  let trendData: Array<{ date: string; credits: number; count: number }>
  let filterClientData: import('./filter-section').ClientRow[]
  let filterModelData: import('./filter-section').ModelRow[]
  let filterVideoTypeData: import('./filter-section').VideoTypeRow[]
  let filterIndustryData: import('./filter-section').IndustryRow[]
  let filterWastageData: import('./filter-section').WastageRow[]
  let userReportData: Array<{
    id: string
    name: string
    credits_assigned: number
    wastage_count: number
    wastage_credits: number
    completed_on_time: number
    deadline_missed: number
    completed_total: number
    active_works: number
  }>
  let periodGenerations: ReportGenerationRow[]

  if (analytics) {
    totalCredits = analytics.totalCredits
    totalGenerations = analytics.totalGenerations
    clientData = withClientPercents(analytics.clientData, totalCredits)
    creatorData = analytics.creatorData
    modelData = analytics.modelData
    trendData = analytics.trendData
    filterModelData = analytics.filterModelData
    userReportData = analytics.userReportData
    periodGenerations = analytics.generations

    const extras = buildFilterExtras(
      periodGenerations,
      (works || []) as Array<{
        id: string
        video_type: string | null
        client_id: string
        status: string
        title: string | null
      }>,
      clientsTyped.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        industry: (c.industry as string | null) ?? null,
      })),
    )
    filterVideoTypeData = extras.filterVideoTypeData
    filterIndustryData = extras.filterIndustryData
    filterWastageData = extras.filterWastageData
    filterClientData = analytics.filterClientData.map((row) => ({
      ...row,
      models: extras.clientModels.get(row.id) || [],
    }))
  } else {
    // Fallback when report_analytics RPC is not deployed yet.
    const generations = await fetchAllRows((from, to) =>
      supabase
        .from('generations')
        .select(
          'id, display_name, result_url, media_type, credits, client_id, work_id, hf_created_at, assigned_by, is_waste, is_irrelevant, wasted_by',
        )
        .gte('hf_created_at', fromIso)
        .lte('hf_created_at', toIso)
        .order('hf_created_at', { ascending: false })
        .range(from, to),
    )
    periodGenerations = (generations || []).map((g) => ({
      id: g.id,
      display_name: g.display_name,
      result_url: g.result_url || '',
      media_type: g.media_type || '',
      credits: parseFloat(g.credits || '0'),
      hf_created_at: g.hf_created_at,
      client_id: g.client_id,
      work_id: g.work_id,
      assigned_by: g.assigned_by,
      is_waste: !!g.is_waste,
      is_irrelevant: !!g.is_irrelevant,
      wasted_by: g.wasted_by,
    }))

    const nonWasteGenerations = periodGenerations.filter(
      (g) => !g.is_waste && !g.is_irrelevant,
    )
    totalCredits = nonWasteGenerations.reduce((s, g) => s + g.credits, 0)
    totalGenerations = nonWasteGenerations.length

    const byClient = new Map<string, { name: string; credits: number; count: number }>()
    nonWasteGenerations.forEach((g) => {
      if (!g.client_id) return
      const existing = byClient.get(g.client_id) || {
        name: clientMap.get(g.client_id) || 'Unknown',
        credits: 0,
        count: 0,
      }
      existing.credits += g.credits
      existing.count++
      byClient.set(g.client_id, existing)
    })
    clientData = withClientPercents(
      Array.from(byClient.entries())
        .map(([id, d]) => ({
          id,
          name: d.name,
          credits: parseFloat(d.credits.toFixed(2)),
          count: d.count,
        }))
        .sort((a, b) => b.credits - a.credits),
      totalCredits,
    )

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
      existing.credits += g.credits
      existing.count++
      byCreator.set(work.creator_id, existing)
    })
    creatorData = Array.from(byCreator.entries())
      .map(([id, d]) => ({
        id,
        name: d.name,
        credits: parseFloat(d.credits.toFixed(2)),
        count: d.count,
      }))
      .sort((a, b) => b.credits - a.credits)

    const byModel = new Map<string, { credits: number; count: number }>()
    nonWasteGenerations.forEach((g) => {
      const existing = byModel.get(g.display_name) || { credits: 0, count: 0 }
      existing.credits += g.credits
      existing.count++
      byModel.set(g.display_name, existing)
    })
    modelData = Array.from(byModel.entries())
      .map(([name, d]) => ({
        name,
        credits: parseFloat(d.credits.toFixed(2)),
        count: d.count,
      }))
      .sort((a, b) => b.credits - a.credits)

    const byDay = new Map<string, { credits: number; count: number }>()
    nonWasteGenerations.forEach((g) => {
      const day = g.hf_created_at.split('T')[0]
      const existing = byDay.get(day) || { credits: 0, count: 0 }
      existing.credits += g.credits
      existing.count++
      byDay.set(day, existing)
    })
    trendData = Array.from(byDay.entries())
      .map(([date, d]) => ({
        date,
        credits: parseFloat(d.credits.toFixed(2)),
        count: d.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const extras = buildFilterExtras(
      periodGenerations,
      (works || []) as Array<{
        id: string
        video_type: string | null
        client_id: string
        status: string
        title: string | null
      }>,
      clientsTyped.map((c) => ({
        id: c.id as string,
        name: c.name as string,
        industry: (c.industry as string | null) ?? null,
      })),
    )
    filterVideoTypeData = extras.filterVideoTypeData
    filterIndustryData = extras.filterIndustryData
    filterWastageData = extras.filterWastageData

    const reworkWorkIds = new Set(
      (works || []).filter((w) => w.status === 'rework').map((w) => w.id),
    )
    const clientRowMap = new Map<string, import('./filter-section').ClientRow>()
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
        models: extras.clientModels.get(c.id) || [],
      })
    })
    periodGenerations.forEach((g) => {
      if (!g.client_id || g.is_irrelevant) return
      const row = clientRowMap.get(g.client_id)
      if (!row) return
      const isRework = g.work_id ? reworkWorkIds.has(g.work_id) : false
      if (g.is_waste) {
        if (isRework) row.reworkWastageCredits += g.credits
        else row.wastageCredits += g.credits
      } else if (isRework) {
        row.reworkUsefulCredits += g.credits
      } else {
        row.usefulCredits += g.credits
      }
    })
    clientRowMap.forEach((row) => {
      row.usefulCredits = parseFloat(row.usefulCredits.toFixed(2))
      row.wastageCredits = parseFloat(row.wastageCredits.toFixed(2))
      row.reworkUsefulCredits = parseFloat(row.reworkUsefulCredits.toFixed(2))
      row.reworkWastageCredits = parseFloat(row.reworkWastageCredits.toFixed(2))
    })
    filterClientData = Array.from(clientRowMap.values())
      .filter((r) => r.totalWorks > 0 || r.usefulCredits > 0 || r.wastageCredits > 0)
      .sort(
        (a, b) =>
          b.usefulCredits + b.wastageCredits - (a.usefulCredits + a.wastageCredits),
      )

    const modelRowMap = new Map<
      string,
      { usefulCredits: number; wastageCredits: number }
    >()
    periodGenerations.forEach((g) => {
      if (g.is_irrelevant) return
      const e = modelRowMap.get(g.display_name) || {
        usefulCredits: 0,
        wastageCredits: 0,
      }
      if (g.is_waste) e.wastageCredits += g.credits
      else e.usefulCredits += g.credits
      modelRowMap.set(g.display_name, e)
    })
    filterModelData = Array.from(modelRowMap.entries())
      .map(([name, d]) => ({
        name,
        usefulCredits: parseFloat(d.usefulCredits.toFixed(2)),
        wastageCredits: parseFloat(d.wastageCredits.toFixed(2)),
      }))
      .sort((a, b) => b.usefulCredits - a.usefulCredits)

    const todayDate = new Date().toISOString().split('T')[0]
    const creators = (memberships || []).filter((m) => m.role === 'creator')
    userReportData = creators.map((creator) => {
      const assignedGens = nonWasteGenerations.filter(
        (g) => g.assigned_by === creator.user_id,
      )
      const creditsAssigned = assignedGens.reduce((s, g) => s + g.credits, 0)
      const wasteGens = periodGenerations.filter(
        (g) => g.wasted_by === creator.user_id && g.is_waste,
      )
      const creatorWorks = (works || []).filter(
        (w) => w.creator_id === creator.user_id,
      )
      const completedWorks = creatorWorks.filter((w) => w.status === 'completed')
      return {
        id: creator.user_id,
        name: creator.full_name,
        credits_assigned: parseFloat(creditsAssigned.toFixed(2)),
        wastage_count: wasteGens.length,
        wastage_credits: parseFloat(
          wasteGens.reduce((s, g) => s + g.credits, 0).toFixed(2),
        ),
        completed_on_time: completedWorks.filter((w) => {
          if (!w.end_date || !w.updated_at) return false
          return w.updated_at.split('T')[0] <= w.end_date
        }).length,
        deadline_missed: creatorWorks.filter((w) => {
          if (!w.end_date) return false
          return w.status !== 'completed' && w.end_date < todayDate
        }).length,
        completed_total: completedWorks.length,
        active_works: creatorWorks.filter((w) => w.status !== 'completed').length,
      }
    })
  }

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

  const csvData = clientData.map((c) => ({
    Client: c.name,
    Credits: c.credits,
    'Percent of Total': c.percent + '%',
    Generations: c.count,
  }))

  return (
    <div className="min-w-0 p-4 sm:p-6 space-y-4 sm:space-y-6 text-neutral-100">
      {/* HEADER + DATE FILTER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Reports</h1>
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
      <section className="min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg">
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
        <div className="px-4 py-3 border-b border-neutral-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-base sm:text-lg">
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
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 max-h-80">
              <table className="w-full min-w-[20rem] text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2 whitespace-nowrap">Client</th>
                    <th className="text-right py-2 whitespace-nowrap">Credits</th>
                    <th className="text-right py-2 whitespace-nowrap">%</th>
                    <th className="text-right py-2 pr-2 whitespace-nowrap">Gens</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {clientData.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-900/40">
                      <td className="py-2 pl-2 text-white max-w-[10rem] sm:max-w-none truncate">
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
        <div className="px-4 py-3 border-b border-neutral-800 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-semibold text-white text-base sm:text-lg">
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
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 p-4">
              <table className="w-full min-w-[44rem] text-sm">
                <thead className="sticky top-0 bg-neutral-950">
                  <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                    <th className="text-left py-2 pl-2 whitespace-nowrap">Creator</th>
                    <th className="text-right py-2 whitespace-nowrap">Credits Assigned</th>
                    <th className="text-right py-2 whitespace-nowrap">Wastage</th>
                    <th className="text-right py-2 whitespace-nowrap">Waste Cr.</th>
                    <th className="text-right py-2 whitespace-nowrap">On Time</th>
                    <th className="text-right py-2 whitespace-nowrap">Missed</th>
                    <th className="text-right py-2 whitespace-nowrap">Completed</th>
                    <th className="text-right py-2 pr-2 whitespace-nowrap">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {userReportData.map((row) => (
                    <tr key={row.id} className="hover:bg-neutral-900/40">
                      <td className="py-2 pl-2 text-white font-medium whitespace-nowrap">
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
      <section className="min-w-0 bg-neutral-950 border border-neutral-800 rounded-lg">
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
          <>
            {/* Phone / tablet: stacked cards (no cramped table or pie legend) */}
            <div className="lg:hidden p-4 space-y-2">
              {modelData.map((row) => (
                <div
                  key={row.name}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-3"
                >
                  <p className="font-medium text-white leading-snug mb-2">{row.name}</p>
                  <div className="flex items-center justify-between gap-3 py-1 text-sm">
                    <span className="text-neutral-500">Credits</span>
                    <span
                      className={`font-bold ${row.credits > 0 ? 'text-orange-400' : 'text-neutral-600'}`}
                    >
                      {row.credits > 0 ? row.credits.toFixed(1) : 'free'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 py-1 text-sm">
                    <span className="text-neutral-500">Generations</span>
                    <span className="font-medium text-neutral-400">{row.count}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop: chart + table side by side */}
            <div className="hidden lg:grid lg:grid-cols-2 gap-4 p-4 min-w-0">
              <div className="min-w-0">
                <ModelChart data={modelData.filter((d) => d.credits > 0)} />
              </div>
              <div className="min-w-0 overflow-x-auto max-h-80">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-950">
                    <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                      <th className="text-left py-2 pl-2 whitespace-nowrap">Model</th>
                      <th className="text-right py-2 whitespace-nowrap">Credits</th>
                      <th className="text-right py-2 pr-2 whitespace-nowrap">Gens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {modelData.map((row) => (
                      <tr key={row.name}>
                        <td className="py-2 pl-2 text-white">{row.name}</td>
                        <td
                          className={`py-2 text-right font-bold whitespace-nowrap ${row.credits > 0 ? 'text-orange-400' : 'text-neutral-600'}`}
                        >
                          {row.credits > 0 ? row.credits.toFixed(1) : 'free'}
                        </td>
                        <td className="py-2 text-right pr-2 text-neutral-400 whitespace-nowrap">
                          {row.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
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
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 max-h-96">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="sticky top-0 bg-neutral-950">
                <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                  <th className="text-left py-2 pl-4 whitespace-nowrap">Client</th>
                  <th className="text-left py-2 whitespace-nowrap">Action</th>
                  <th className="text-left py-2 whitespace-nowrap">Detail</th>
                  <th className="text-left py-2 whitespace-nowrap">By</th>
                  <th className="text-right py-2 pr-4 whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {clientActivity.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-900/30">
                    <td className="py-2 pl-4 text-white font-medium max-w-[8rem] sm:max-w-[12rem] truncate">
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
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 max-h-96">
            <table className="w-full min-w-[36rem] text-sm">
              <thead className="sticky top-0 bg-neutral-950">
                <tr className="text-xs text-neutral-500 border-b border-neutral-800">
                  <th className="text-left py-2 pl-4 whitespace-nowrap">Work</th>
                  <th className="text-left py-2 whitespace-nowrap">Action</th>
                  <th className="text-left py-2 whitespace-nowrap">Detail</th>
                  <th className="text-left py-2 whitespace-nowrap">By</th>
                  <th className="text-right py-2 pr-4 whitespace-nowrap">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {workActivity.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-900/30">
                    <td className="py-2 pl-4 text-white font-medium max-w-[8rem] sm:max-w-[12rem] truncate">
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
