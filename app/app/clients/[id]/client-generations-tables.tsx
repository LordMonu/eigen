'use client'

// app/app/clients/[id]/client-generations-tables.tsx
// Two columns on the client detail page that mirror the work-detail layout:
//   - Assigned generations (with per-row Unassign within 60s for the assigner;
//     master/manager can unassign anytime)
//   - Wastage (with per-row Mark Useful within 60s for the waster;
//     master can mark useful anytime)
// Reuses the button + media components from the work-detail assign-tables.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import {
  MediaPreview,
  UnassignButton,
  WastageButton,
} from '@/app/app/works/[id]/assign-tables'
import Link from 'next/link'
import { PaginationButtons, paginate } from '@/components/ui/pagination-buttons'

interface Generation {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: string
  hf_created_at: string
  work_id: string | null
  assigned_at: string | null
  assigned_by: string | null
  is_waste: boolean
  wasted_at: string | null
  wasted_by: string | null
  hf_connection_label: string | null
}

interface Props {
  clientName: string
  generations: Generation[]
  /** work_id → title, for the small "via work" hint per row. */
  workTitles: Record<string, string>
  userRole: 'master' | 'manager' | 'creator'
  userId: string
  /** All connected HF account labels (from hf_connections). */
  accountLabels: string[]
}

export function ClientGenerationsTables({
  clientName,
  generations,
  workTitles,
  userRole,
  userId,
  accountLabels,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [accountFilter, setAccountFilter] = useState<string | null>(null)

  const allAssigned = generations.filter((g) => !g.is_waste)
  const allWasted = generations.filter((g) => g.is_waste)

  const assigned = accountFilter
    ? allAssigned.filter((g) => g.hf_connection_label === accountFilter)
    : allAssigned
  const wasted = accountFilter
    ? allWasted.filter((g) => g.hf_connection_label === accountFilter)
    : allWasted

  const [assignedPage, setAssignedPage] = useState(1)
  const [wastedPage, setWastedPage] = useState(1)
  const aPag = paginate(assigned, assignedPage)
  const wPag = paginate(wasted, wastedPage)

  return (
    <div className="space-y-3 mb-6">
      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-neutral-400 hover:text-white text-xs ml-4"
          >
            dismiss
          </button>
        </div>
      )}

      {accountLabels.length > 1 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">
            Account:
          </span>
          <button
            type="button"
            onClick={() => { setAccountFilter(null); setAssignedPage(1); setWastedPage(1) }}
            className={`text-xs px-2 py-0.5 rounded transition-colors ${
              accountFilter === null
                ? 'bg-lime-400 text-black'
                : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
            }`}
          >
            All
          </button>
          {accountLabels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => { setAccountFilter(label); setAssignedPage(1); setWastedPage(1) }}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                accountFilter === label
                  ? 'bg-lime-400 text-black'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSIGNED */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm">
              Assigned to {clientName}
            </h2>
            <p className="text-xs text-neutral-500">
              {assigned.length} generation{assigned.length === 1 ? '' : 's'}
            </p>
          </div>
          {assigned.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned to {clientName} yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {aPag.slice.map((g) => (
                    <tr key={g.id} className="hover:bg-neutral-900/60">
                      <td className="px-2 py-2">
                        <MediaPreview
                          url={g.result_url}
                          mediaType={g.media_type}
                          name={g.display_name}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-white">
                          {g.display_name}
                        </div>
                        <div className="text-neutral-500 text-xs mt-0.5 space-y-0.5">
                          {g.work_id && workTitles[g.work_id] && (
                            <div>
                              via{' '}
                              <Link
                                href={`/app/works/${g.work_id}`}
                                className="text-lime-400 hover:underline"
                              >
                                {workTitles[g.work_id]}
                              </Link>
                            </div>
                          )}
                          {g.hf_connection_label && (
                            <div>
                              from{' '}
                              <span className="text-lime-400">
                                {g.hf_connection_label}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span
                          className={`font-bold ${parseFloat(g.credits) > 0 ? 'text-orange-400' : 'text-neutral-500'}`}
                        >
                          {parseFloat(g.credits) > 0
                            ? parseFloat(g.credits).toFixed(1)
                            : 'free'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <UnassignButton
                          generationId={g.id}
                          assignedAt={g.assigned_at}
                          assignedBy={g.assigned_by}
                          userRole={userRole}
                          userId={userId}
                          onDone={() => router.refresh()}
                          onError={(msg) => setError(msg)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <PaginationButtons page={aPag.page} totalPages={aPag.totalPages} total={aPag.total} onPageChange={setAssignedPage} />
            </div>
          )}
        </div>

        {/* WASTAGE */}
        <div className="bg-neutral-950 border border-red-900/50 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white text-sm flex items-center gap-2">
              Wastage
              {wasted.length > 0 && (
                <Badge
                  variant="outline"
                  className="text-red-400 border-red-700"
                >
                  {wasted.length}
                </Badge>
              )}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful for {clientName}
            </p>
          </div>
          {wasted.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>No wastage yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {wPag.slice.map((g) => (
                    <tr
                      key={g.id}
                      className="bg-red-950/10 hover:bg-red-950/20"
                    >
                      <td className="px-2 py-2">
                        <MediaPreview
                          url={g.result_url}
                          mediaType={g.media_type}
                          name={g.display_name}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-neutral-400 line-through">
                          {g.display_name}
                        </div>
                        <div className="text-xs text-neutral-600 mt-0.5 space-y-0.5">
                          <div>
                            Marked{' '}
                            {g.wasted_at
                              ? new Date(g.wasted_at).toLocaleTimeString()
                              : ''}
                          </div>
                          {g.hf_connection_label && (
                            <div>
                              from{' '}
                              <span className="text-red-400">
                                {g.hf_connection_label}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <span className="font-bold text-red-400">
                          {parseFloat(g.credits) > 0
                            ? parseFloat(g.credits).toFixed(1)
                            : 'free'}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <WastageButton
                          generationId={g.id}
                          wastedAt={g.wasted_at}
                          wastedBy={g.wasted_by}
                          userRole={userRole}
                          userId={userId}
                          onDone={() => router.refresh()}
                          onError={(msg) => setError(msg)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
              <PaginationButtons page={wPag.page} totalPages={wPag.totalPages} total={wPag.total} onPageChange={setWastedPage} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
