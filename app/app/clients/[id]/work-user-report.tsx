// app/app/clients/[id]/work-user-report.tsx
// Server-rendered: for each work on the client, a compact "credit breakdown
// by user" table — User / Actual / Wastage / Rework. Only users who actually
// contributed to that work appear. The work-level header shows the work's
// title + status badge and links into the work-detail page.

import Link from 'next/link'
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from '@/lib/work-helpers'

export interface WorkUserStat {
  userId: string
  name: string
  actual: number
  wastage: number
  rework: number
}

export interface WorkReportRow {
  workId: string
  title: string
  status: WorkStatus
  stats: WorkUserStat[]
}

interface Props {
  rows: WorkReportRow[]
  rangeLabel: string
}

export function WorkUserReport({ rows, rangeLabel }: Props) {
  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Credit breakdown by work &amp; user</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Per-work, per-user credits. Only users who contributed to the work
            appear. Scope: {rangeLabel}.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center text-neutral-500 text-sm">
          No credits attributed in this range.
        </div>
      ) : (
        <div className="divide-y divide-neutral-800">
          {rows.map((row) => {
            const totalActual = row.stats.reduce((s, u) => s + u.actual, 0)
            const totalWaste = row.stats.reduce((s, u) => s + u.wastage, 0)
            const totalRework = row.stats.reduce((s, u) => s + u.rework, 0)
            return (
              <div key={row.workId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <Link
                    href={`/app/works/${row.workId}`}
                    className="font-medium text-white hover:text-lime-400 transition-colors truncate"
                  >
                    {row.title}
                  </Link>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[row.status]}`}
                  >
                    {WORK_STATUS_LABELS[row.status]}
                  </span>
                </div>

                {row.stats.length === 0 ? (
                  <p className="text-xs text-neutral-500 pl-1">
                    No credits attributed to this work in this range.
                  </p>
                ) : (
                  <div className="bg-neutral-900/40 border border-neutral-800 rounded">
                    <div className="px-3 py-1.5 grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-2 text-[10px] uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
                      <div>User</div>
                      <div className="text-right text-lime-400">Actual</div>
                      <div className="text-right text-yellow-400">Wastage</div>
                      <div className="text-right text-orange-400">Rework</div>
                    </div>
                    {row.stats.map((u) => (
                      <div
                        key={u.userId}
                        className="px-3 py-1.5 grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-2 items-center text-xs border-t border-neutral-900"
                      >
                        <div className="min-w-0 truncate text-white">
                          {u.name}
                        </div>
                        <div className="text-right font-mono text-lime-300">
                          {u.actual > 0 ? u.actual.toFixed(1) : '—'}
                        </div>
                        <div className="text-right font-mono text-yellow-300">
                          {u.wastage > 0 ? u.wastage.toFixed(1) : '—'}
                        </div>
                        <div className="text-right font-mono text-orange-300">
                          {u.rework > 0 ? u.rework.toFixed(1) : '—'}
                        </div>
                      </div>
                    ))}
                    <div className="px-3 py-1.5 grid grid-cols-[1fr_repeat(3,minmax(0,4.5rem))] gap-2 items-center text-xs bg-neutral-900/60 border-t border-neutral-800">
                      <div className="min-w-0 truncate text-neutral-500 uppercase tracking-wider text-[10px]">
                        Total
                      </div>
                      <div className="text-right font-mono text-lime-400 font-semibold">
                        {totalActual > 0 ? totalActual.toFixed(1) : '—'}
                      </div>
                      <div className="text-right font-mono text-yellow-400 font-semibold">
                        {totalWaste > 0 ? totalWaste.toFixed(1) : '—'}
                      </div>
                      <div className="text-right font-mono text-orange-400 font-semibold">
                        {totalRework > 0 ? totalRework.toFixed(1) : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
