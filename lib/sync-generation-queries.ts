import type { SupabaseClient } from '@supabase/supabase-js'
import { PAGE_SIZE } from '@/components/ui/pagination-buttons'

export const SYNC_GEN_COLS =
  'id, external_id, display_name, job_set_type, result_url, media_type, prompt, credits, hf_created_at, client_id, work_id, assigned_at, assigned_by, is_waste, is_irrelevant, wasted_at, wasted_by, hf_connection_label'

export type SyncTab = 'unassigned' | 'assigned' | 'wasted' | 'irrelevant'

export interface SyncStats {
  unassigned_count: number
  unassigned_credits: number
  assigned_count: number
  assigned_credits: number
  wasted_count: number
  wasted_credits: number
  irrelevant_count: number
  irrelevant_credits: number
}

export function tabTotalPages(count: number) {
  return Math.max(1, Math.ceil(count / PAGE_SIZE))
}

function applyTabFilter<T extends { is: Function; not: Function; eq: Function }>(
  query: T,
  tab: SyncTab,
): T {
  switch (tab) {
    case 'unassigned':
      return query
        .is('client_id', null)
        .eq('is_irrelevant', false)
        .eq('is_waste', false) as T
    case 'assigned':
      return query
        .not('client_id', 'is', null)
        .eq('is_waste', false)
        .eq('is_irrelevant', false) as T
    case 'wasted':
      return query.eq('is_waste', true).eq('is_irrelevant', false) as T
    case 'irrelevant':
      return query.eq('is_irrelevant', true) as T
  }
}

function applyAccountLabel<
  T extends { eq: (col: string, val: string) => T },
>(query: T, accountLabel?: string | null): T {
  if (accountLabel) return query.eq('hf_connection_label', accountLabel)
  return query
}

async function countRows(
  supabase: SupabaseClient,
  tab: SyncTab,
  accountLabel?: string | null,
): Promise<number> {
  let query = supabase
    .from('generations')
    .select('*', { count: 'exact', head: true })
  query = applyTabFilter(query, tab)
  query = applyAccountLabel(query, accountLabel)
  const { count, error } = await query
  if (error) return 0
  return count ?? 0
}

/** Fallback when sync_generation_stats RPC is not deployed yet. */
async function fetchSyncStatsFallback(
  supabase: SupabaseClient,
  accountLabel?: string | null,
): Promise<SyncStats> {
  const tabs: SyncTab[] = ['unassigned', 'assigned', 'wasted', 'irrelevant']
  const counts = await Promise.all(
    tabs.map((tab) => countRows(supabase, tab, accountLabel)),
  )
  return {
    unassigned_count: counts[0],
    unassigned_credits: 0,
    assigned_count: counts[1],
    assigned_credits: 0,
    wasted_count: counts[2],
    wasted_credits: 0,
    irrelevant_count: counts[3],
    irrelevant_credits: 0,
  }
}

export async function fetchSyncStats(
  supabase: SupabaseClient,
  accountLabel?: string | null,
): Promise<SyncStats | null> {
  const { data, error } = await supabase
    .rpc('sync_generation_stats', {
      p_hf_label: accountLabel || null,
    })
    .maybeSingle()

  if (!error && data) {
    const row = data as Record<string, unknown>
    return {
      unassigned_count: Number(row.unassigned_count ?? 0),
      unassigned_credits: parseFloat(String(row.unassigned_credits ?? 0)),
      assigned_count: Number(row.assigned_count ?? 0),
      assigned_credits: parseFloat(String(row.assigned_credits ?? 0)),
      wasted_count: Number(row.wasted_count ?? 0),
      wasted_credits: parseFloat(String(row.wasted_credits ?? 0)),
      irrelevant_count: Number(row.irrelevant_count ?? 0),
      irrelevant_credits: parseFloat(String(row.irrelevant_credits ?? 0)),
    }
  }

  if (error && error.code !== 'PGRST202') {
    console.error('[sync] sync_generation_stats RPC failed:', error.message)
  }

  try {
    return await fetchSyncStatsFallback(supabase, accountLabel)
  } catch (fallbackError) {
    console.error('[sync] stats fallback failed:', fallbackError)
    return null
  }
}

export async function fetchSyncTabPage<T>(
  supabase: SupabaseClient,
  tab: SyncTab,
  page: number,
  accountLabel?: string | null,
  options?: {
    pageSize?: number
    excludeFeatures?: boolean
    count?: 'exact'
  },
) {
  const pageSize = options?.pageSize ?? PAGE_SIZE
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .from('generations')
    .select(SYNC_GEN_COLS, options?.count ? { count: options.count } : undefined)
    .order('hf_created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, to)

  query = applyTabFilter(query, tab)

  if (accountLabel) {
    query = query.eq('hf_connection_label', accountLabel)
  }

  if (options?.excludeFeatures) {
    query = query.neq('media_type', 'feature')
  }

  const { data, error, count } = await query
  return { data: (data || []) as T[], error, count }
}
