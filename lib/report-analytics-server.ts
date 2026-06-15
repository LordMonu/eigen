// lib/report-analytics-server.ts — fetch pre-aggregated report data from Postgres.
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  ClientRow,
  IndustryRow,
  ModelRow,
  VideoTypeRow,
  WastageRow,
} from '@/app/app/reports/filter-section'

export interface ReportGenerationRow {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: number
  hf_created_at: string
  client_id: string | null
  work_id: string | null
  assigned_by: string | null
  is_waste: boolean
  is_irrelevant: boolean
  wasted_by: string | null
}

export interface ReportAnalyticsPayload {
  totalCredits: number
  totalGenerations: number
  clientData: Array<{
    id: string
    name: string
    credits: number
    count: number
  }>
  creatorData: Array<{
    id: string
    name: string
    credits: number
    count: number
  }>
  modelData: Array<{
    name: string
    credits: number
    count: number
  }>
  trendData: Array<{
    date: string
    credits: number
    count: number
  }>
  filterClientData: ClientRow[]
  filterModelData: ModelRow[]
  userReportData: Array<{
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
  generations: ReportGenerationRow[]
  uniqueModels: string[]
}

export async function fetchReportAnalytics(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
): Promise<ReportAnalyticsPayload | null> {
  const { data, error } = await supabase
    .rpc('report_analytics', {
      p_from: `${fromDate}T00:00:00Z`,
      p_to: `${toDate}T23:59:59Z`,
    })
    .maybeSingle()

  if (error || !data) {
    console.error('[reports] report_analytics RPC failed:', error?.message)
    return null
  }

  const raw = data as Record<string, unknown>
  return {
    totalCredits: Number(raw.totalCredits ?? 0),
    totalGenerations: Number(raw.totalGenerations ?? 0),
    clientData: (raw.clientData as ReportAnalyticsPayload['clientData']) ?? [],
    creatorData: (raw.creatorData as ReportAnalyticsPayload['creatorData']) ?? [],
    modelData: (raw.modelData as ReportAnalyticsPayload['modelData']) ?? [],
    trendData: (raw.trendData as ReportAnalyticsPayload['trendData']) ?? [],
    filterClientData:
      (raw.filterClientData as ReportAnalyticsPayload['filterClientData']) ?? [],
    filterModelData:
      (raw.filterModelData as ReportAnalyticsPayload['filterModelData']) ?? [],
    userReportData:
      (raw.userReportData as ReportAnalyticsPayload['userReportData']) ?? [],
    generations: (raw.generations as ReportGenerationRow[]) ?? [],
    uniqueModels: (raw.uniqueModels as string[]) ?? [],
  }
}

export function buildFilterExtras(
  generations: ReportGenerationRow[],
  works: Array<{
    id: string
    video_type: string | null
    client_id: string
    status: string
    title: string | null
  }>,
  clients: Array<{ id: string; name: string; industry: string | null }>,
): {
  filterVideoTypeData: VideoTypeRow[]
  filterIndustryData: IndustryRow[]
  filterWastageData: WastageRow[]
  clientModels: Map<string, { name: string; credits: number }[]>
} {
  const pg = generations.filter((g) => !g.is_irrelevant)
  const workMap = new Map(works.map((w) => [w.id, w]))
  const clientMap = new Map(clients.map((c) => [c.id, c.name]))
  const reworkWorkIds = new Set(
    works.filter((w) => w.status === 'rework').map((w) => w.id),
  )
  const clientIndustryMap = new Map(
    clients.map((c) => [c.id, c.industry || 'Unspecified']),
  )

  const clientModelMap = new Map<string, Map<string, number>>()
  pg.forEach((g) => {
    if (!g.client_id) return
    if (!clientModelMap.has(g.client_id)) {
      clientModelMap.set(g.client_id, new Map())
    }
    const mm = clientModelMap.get(g.client_id)!
    mm.set(g.display_name, (mm.get(g.display_name) || 0) + g.credits)
  })

  const clientModels = new Map<string, { name: string; credits: number }[]>()
  clientModelMap.forEach((mm, cid) => {
    clientModels.set(
      cid,
      Array.from(mm.entries())
        .map(([name, cr]) => ({ name, credits: parseFloat(cr.toFixed(2)) }))
        .sort((a, b) => b.credits - a.credits),
    )
  })

  const vtMap = new Map<
    string,
    { totalWorks: number; usefulCredits: number; wastageCredits: number }
  >()
  works.forEach((w) => {
    const vt = w.video_type || 'Unspecified'
    const e = vtMap.get(vt) || {
      totalWorks: 0,
      usefulCredits: 0,
      wastageCredits: 0,
    }
    e.totalWorks++
    vtMap.set(vt, e)
  })
  pg.forEach((g) => {
    if (!g.work_id) return
    const w = workMap.get(g.work_id)
    if (!w) return
    const vt = w.video_type || 'Unspecified'
    const e = vtMap.get(vt) || {
      totalWorks: 0,
      usefulCredits: 0,
      wastageCredits: 0,
    }
    if (g.is_waste) e.wastageCredits += g.credits
    else e.usefulCredits += g.credits
    vtMap.set(vt, e)
  })

  const industryMap = new Map<
    string,
    {
      clients: Set<string>
      totalWorks: number
      usefulCredits: number
      wastageCredits: number
    }
  >()
  clients.forEach((c) => {
    const ind = c.industry || 'Unspecified'
    const e = industryMap.get(ind) || {
      clients: new Set(),
      totalWorks: 0,
      usefulCredits: 0,
      wastageCredits: 0,
    }
    e.clients.add(c.id)
    industryMap.set(ind, e)
  })
  works.forEach((w) => {
    if (!w.client_id) return
    const ind = clientIndustryMap.get(w.client_id) || 'Unspecified'
    const e = industryMap.get(ind) || {
      clients: new Set(),
      totalWorks: 0,
      usefulCredits: 0,
      wastageCredits: 0,
    }
    e.totalWorks++
    industryMap.set(ind, e)
  })
  pg.forEach((g) => {
    if (!g.client_id) return
    const ind = clientIndustryMap.get(g.client_id) || 'Unspecified'
    const e = industryMap.get(ind) || {
      clients: new Set(),
      totalWorks: 0,
      usefulCredits: 0,
      wastageCredits: 0,
    }
    if (g.is_waste) e.wastageCredits += g.credits
    else e.usefulCredits += g.credits
    industryMap.set(ind, e)
  })

  const wastageRowMap = new Map<string, WastageRow>()
  works.forEach((w) => {
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
  pg.forEach((g) => {
    if (!g.work_id) return
    const row = wastageRowMap.get(g.work_id)
    if (!row) return
    const isRework = reworkWorkIds.has(g.work_id)
    if (g.is_waste) {
      if (isRework) row.reworkWastageCredits += g.credits
      else row.wastageCredits += g.credits
    } else {
      row.usefulCredits += g.credits
    }
  })

  return {
    filterVideoTypeData: Array.from(vtMap.entries())
      .map(([type, d]) => ({
        type,
        ...d,
        usefulCredits: parseFloat(d.usefulCredits.toFixed(2)),
        wastageCredits: parseFloat(d.wastageCredits.toFixed(2)),
      }))
      .sort((a, b) => b.usefulCredits - a.usefulCredits),
    filterIndustryData: Array.from(industryMap.entries())
      .map(([industry, d]) => ({
        industry,
        totalClients: d.clients.size,
        totalWorks: d.totalWorks,
        usefulCredits: parseFloat(d.usefulCredits.toFixed(2)),
        wastageCredits: parseFloat(d.wastageCredits.toFixed(2)),
      }))
      .sort((a, b) => b.usefulCredits - a.usefulCredits),
    filterWastageData: Array.from(wastageRowMap.values())
      .map((r) => ({
        ...r,
        usefulCredits: parseFloat(r.usefulCredits.toFixed(2)),
        wastageCredits: parseFloat(r.wastageCredits.toFixed(2)),
        reworkWastageCredits: parseFloat(r.reworkWastageCredits.toFixed(2)),
        totalWastage: parseFloat(
          (r.wastageCredits + r.reworkWastageCredits).toFixed(2),
        ),
      }))
      .filter((r) => r.totalWastage > 0)
      .sort((a, b) => b.totalWastage - a.totalWastage),
    clientModels,
  }
}

export function withClientPercents(
  clientData: ReportAnalyticsPayload['clientData'],
  totalCredits: number,
) {
  return clientData.map((c) => ({
    ...c,
    percent:
      totalCredits > 0
        ? parseFloat(((c.credits / totalCredits) * 100).toFixed(1))
        : 0,
  }))
}
