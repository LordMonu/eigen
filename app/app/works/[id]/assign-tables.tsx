'use client'

// app/app/works/[id]/assign-tables.tsx
// Two columns below the credit-usage progress bar:
//   - Assigned to client  (with per-row Unassign within 20s for the assigner;
//     master/manager can unassign anytime)
//   - Wastage             (with per-row Mark-Useful within 20s for the waster;
//     master can mark useful anytime)
//
// The Unassigned generations table moved into the SyncAndAssign component
// upstairs — this file no longer fetches/displays unassigned entries.
//
// A "Rework" tag is rendered on any generation whose work is currently in
// the `rework` status. The work-status lookup is passed in from the server
// component via workStatusMap.

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Undo2 } from 'lucide-react'
import type { WorkStatus } from '@/lib/work-helpers'
import { PaginationButtons, paginate } from '@/components/ui/pagination-buttons'

// Per spec: 60-second window for unassign-undo / mark-useful-undo.
// Kept in sync with the same threshold on the unassign + waste API routes.
const UNDO_WINDOW_MS = 60000

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
  is_irrelevant: boolean
  wasted_at: string | null
  wasted_by: string | null
  hf_connection_label: string | null
}

interface Props {
  workId: string
  clientName: string
  assignedToClient: Generation[]
  /** Map of work_id → status. Used to flag the "Rework" tag per row. */
  workStatusMap: Record<string, WorkStatus>
  userRole: 'master' | 'manager' | 'creator'
  userId: string
  accounts: { id: string; label: string }[]
  readOnly?: boolean
}

export function MediaPreview({
  url,
  mediaType,
  name,
}: {
  url: string
  mediaType: string
  name: string
}) {
  if (mediaType === 'video') {
    return (
      <video
        src={url}
        className="w-14 h-10 rounded object-cover bg-black"
        preload="metadata"
        muted
        onMouseEnter={(e) => {
          void (e.currentTarget as HTMLVideoElement).play()
        }}
        onMouseLeave={(e) => {
          const v = e.currentTarget as HTMLVideoElement
          v.pause()
          v.currentTime = 0
        }}
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className="w-14 h-10 rounded object-cover bg-neutral-800"
      loading="lazy"
    />
  )
}

function ReworkTag() {
  return (
    <Badge
      variant="outline"
      className="text-orange-300 border-orange-700 bg-orange-950/40 text-[10px]"
    >
      Rework
    </Badge>
  )
}

export function UnassignButton({
  generationId,
  assignedAt,
  assignedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string
  assignedAt: string | null
  assignedBy: string | null
  userRole: string
  userId: string
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const isMasterOrManager = userRole === 'master' || userRole === 'manager'
  const isAssigner = assignedBy === userId

  useEffect(() => {
    if (isMasterOrManager) return
    if (!isAssigner || !assignedAt) return

    const assignedTime = new Date(assignedAt).getTime()
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - assignedTime)
      if (remaining <= 0) {
        setTimeLeft(0)
      } else {
        setTimeLeft(Math.ceil(remaining / 1000))
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [isMasterOrManager, isAssigner, assignedAt])

  if (!isMasterOrManager) {
    if (!isAssigner || timeLeft === 0 || timeLeft === null) return null
  }

  async function handleUnassign() {
    setBusy(true)
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: 'POST',
      })
      if (res.ok) {
        // Wrap the parent's refresh in a transition so the button stays
        // disabled until the new server data has rendered (no enabled flicker).
        startTransition(() => {
          onDone()
        })
      } else {
        const data = await res.json().catch(() => ({}))
        onError(`Unassign failed: ${data.error || 'unknown error'}`)
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : 'network error'}`,
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-red-400 border-red-900 hover:bg-red-950"
    >
      {busy || isPending
        ? '…'
        : isMasterOrManager
          ? 'Unassign'
          : `Undo (${timeLeft}s)`}
    </Button>
  )
}

// Renders the per-row action button in the Wastage table. Clicking it pulls
// the generation fully back to the unassigned pool (clears client/work/waste
// fields). The label is "Unassign" — replacing the older "Mark Useful" which
// only flipped is_waste back to false and left the row in the Assigned table.
export function WastageButton({
  generationId,
  wastedAt,
  wastedBy,
  userRole,
  userId,
  onDone,
  onError,
}: {
  generationId: string
  wastedAt: string | null
  wastedBy: string | null
  userRole: string
  userId: string
  onDone: () => void
  onError: (msg: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [timeLeft, setTimeLeft] = useState<number | null>(null)

  const isMasterOrManager = userRole === 'master' || userRole === 'manager'
  const isWaster = wastedBy === userId
  const isWasted = wastedAt !== null

  useEffect(() => {
    if (!isWasted || !wastedAt) return
    if (isMasterOrManager) return
    if (!isWaster) return

    const wastedTime = new Date(wastedAt).getTime()
    function check() {
      const remaining = UNDO_WINDOW_MS - (Date.now() - wastedTime)
      if (remaining <= 0) {
        setTimeLeft(0)
      } else {
        setTimeLeft(Math.ceil(remaining / 1000))
      }
    }
    check()
    const interval = setInterval(check, 1000)
    return () => clearInterval(interval)
  }, [isWasted, wastedAt, isMasterOrManager, isWaster])

  async function handleUnassign() {
    setBusy(true)
    try {
      const res = await fetch(`/api/generations/${generationId}/unassign`, {
        method: 'POST',
      })
      if (res.ok) {
        startTransition(() => {
          onDone()
        })
      } else {
        const data = await res.json().catch(() => ({}))
        onError(`Unassign failed: ${data.error || 'unknown error'}`)
      }
    } catch (err) {
      onError(
        `Unassign failed: ${err instanceof Error ? err.message : 'network error'}`,
      )
    } finally {
      setBusy(false)
    }
  }

  if (!isWasted) return null

  // Visibility: master/manager anytime; waster only within the 60s window.
  const isWithinWindow = isWaster && timeLeft !== null && timeLeft > 0
  if (!isMasterOrManager && !isWithinWindow) return null

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleUnassign}
      disabled={busy || isPending}
      className="h-6 text-xs px-2 text-lime-400 border-lime-700 hover:bg-lime-950"
    >
      {busy || isPending ? (
        '…'
      ) : (
        <>
          <Undo2 className="size-3 mr-1" />
          {isMasterOrManager && !isWithinWindow
            ? 'Unassign'
            : `Unassign (${timeLeft}s)`}
        </>
      )}
    </Button>
  )
}

export function AssignTables({
  workId,
  clientName,
  assignedToClient,
  workStatusMap,
  userRole,
  userId,
  accounts,
  readOnly = false,
}: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [selectedAccountLabel, setSelectedAccountLabel] = useState<string>(accounts[0]?.label || '')

  const allAssigned = assignedToClient.filter((g) => !g.is_waste && !g.is_irrelevant)
  const allWasted = assignedToClient.filter((g) => g.is_waste && !g.is_irrelevant)
  const allIrrelevant = assignedToClient.filter((g) => g.is_irrelevant)

  const assignedUseful = selectedAccountLabel
    ? allAssigned.filter((g) => g.hf_connection_label === selectedAccountLabel)
    : allAssigned
  const wasted = selectedAccountLabel
    ? allWasted.filter((g) => g.hf_connection_label === selectedAccountLabel)
    : allWasted

  const assignedToThisWork = assignedUseful.filter((g) => g.work_id === workId)
  const assignedElsewhere = assignedUseful.filter((g) => g.work_id !== workId)

  const [assignedPage, setAssignedPage] = useState(1)
  const [wastedPage, setWastedPage] = useState(1)
  const aPag = paginate(assignedUseful, assignedPage)
  const wPag = paginate(wasted, wastedPage)

  // Total credits per bucket
  const totalAssignedCredits = assignedUseful.reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0,
  )
  const totalWastedCredits = wasted.reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0,
  )

  // The Rework tag is a CROSS-WORK signal: it flags a row whose source
  // work is in 'rework' status AND is DIFFERENT from the work we're viewing.
  // The current work's own status already lives in the header status badge,
  // so re-stamping every row would be redundant noise.
  function renderReworkTag(genWorkId: string | null) {
    if (!genWorkId) return null
    if (genWorkId === workId) return null
    const status = workStatusMap[genWorkId]
    if (status !== 'rework') return null
    return (
      <span className="ml-1 inline-flex align-middle">
        <ReworkTag />
      </span>
    )
  }

  return (
    <div className="space-y-3">
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

      {accounts.length > 1 && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">
            Account:
          </span>
          {accounts.map((acc) => (
            <button
              key={acc.id}
              type="button"
              onClick={() => { setSelectedAccountLabel(acc.label); setAssignedPage(1); setWastedPage(1) }}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${
                selectedAccountLabel === acc.label
                  ? 'bg-lime-400 text-black'
                  : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
              }`}
            >
              {acc.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ASSIGNED TO THIS CLIENT */}
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white text-sm">
                Assigned to {clientName}
              </h2>
              <span className="text-sm font-bold text-lime-400 font-mono">
                {totalAssignedCredits.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              {assignedToThisWork.length} on this work ·{' '}
              {assignedElsewhere.length} on other works
            </p>
          </div>
          {assignedUseful.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-sm">
              <p>Nothing assigned to {clientName} yet.</p>
            </div>
          ) : (
            <div className="flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {aPag.slice.map((g) => (
                    <tr
                      key={g.id}
                      className={g.work_id === workId ? 'bg-lime-950/20' : ''}
                    >
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
                          {renderReworkTag(g.work_id) && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {renderReworkTag(g.work_id)}
                            </div>
                          )}
                          {g.hf_connection_label && (
                            <div className="text-neutral-500 text-xs">
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
                      {!readOnly && (
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
                      )}
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
            <div className="flex items-center justify-between">
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
              <span className="text-sm font-bold text-red-400 font-mono">
                {totalWastedCredits.toFixed(1)} cr
              </span>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Marked as not useful
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>
                              Marked{' '}
                              {g.wasted_at
                                ? new Date(g.wasted_at).toLocaleTimeString()
                                : ''}
                            </span>
                            {renderReworkTag(g.work_id)}
                          </div>
                          {g.hf_connection_label && (
                            <div className="text-neutral-600">
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
                      {!readOnly && (
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
                      )}
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

      {/* IRRELEVANT */}
      {allIrrelevant.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-700/30 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-neutral-500 text-sm flex items-center gap-2">
              Irrelevant
              <Badge variant="outline" className="text-neutral-600 border-neutral-700">
                {allIrrelevant.length}
              </Badge>
            </h2>
            <p className="text-xs text-neutral-600 mt-0.5">Practice / past work — not counted in credits</p>
          </div>
          <div className="overflow-auto max-h-44">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-neutral-800/30">
                {allIrrelevant.map((g) => (
                  <tr key={g.id} className="opacity-40">
                    <td className="px-2 py-1.5">
                      <MediaPreview url={g.result_url} mediaType={g.media_type} name={g.display_name} />
                    </td>
                    <td className="px-2 py-1.5 text-neutral-500">{g.display_name}</td>
                    {g.hf_connection_label && (
                      <td className="px-2 py-1.5 text-neutral-600 text-[11px]">{g.hf_connection_label}</td>
                    )}
                    <td className="px-2 py-1.5 text-right text-neutral-600">
                      {parseFloat(g.credits) > 0 ? parseFloat(g.credits).toFixed(1) : 'free'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
