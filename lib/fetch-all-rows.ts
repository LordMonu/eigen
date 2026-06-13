// lib/fetch-all-rows.ts
// PostgREST caps every SELECT at ~1000 rows per request. This helper walks a
// table in fixed-size batches via .range() until a short page signals the end,
// so callers get the COMPLETE result set (e.g. 13k+ generations) instead of a
// silently-truncated first 1000.
//
// Usage:
//   const rows = await fetchAllRows<Row>((from, to) =>
//     supabase.from('generations').select(cols).order('hf_created_at').range(from, to)
//   )

export async function fetchAllRows<T>(
  makeQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  batch = 1000
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += batch) {
    const { data, error } = await makeQuery(from, from + batch - 1)
    if (error || !data || data.length === 0) break
    out.push(...data)
    if (data.length < batch) break
  }
  return out
}
