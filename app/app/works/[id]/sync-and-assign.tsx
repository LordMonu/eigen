'use client'

// app/app/works/[id]/sync-and-assign.tsx — right-hand 50% container that
// drives a two-step modal flow:
//   1. Click "Sync & Assign" → open MODAL A IMMEDIATELY with shimmer
//      rows while POST /api/hf-sync runs in the background. Once the
//      sync resolves, loadUnassigned() repopulates the picker — or the
//      modal shows an inline error if it failed.
//   2. MODAL A — multi-select unassigned generations. Sticky header with
//      "Assign" + "Cancel". "Assign" opens MODAL B.
//   3. MODAL B — pick a client (defaulted to the current work's client) and
//      hit "Actual usage" or "Wastage". Both buttons fan out per-selected
//      generation:
//        - Actual usage → POST /api/works/{workId}/assign-generation
//                          with { generationId, clientId } per gen
//        - Wastage     → POST /api/generations/{generationId}/waste
//                          with { is_waste: true } per gen
//
// After the batch settles, the modal closes, the selection clears, and
// router.refresh() pulls the new server state so the Assigned + Wastage
// tables below update.

import { useState, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Check, X, RefreshCw } from 'lucide-react'
import { PaginationButtons, paginate } from '@/components/ui/pagination-buttons'

interface UnassignedGeneration {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: string
  hf_created_at: string
  hf_connection_label: string | null
}

export interface CreatorStat {
  userId: string
  name: string
  /** credits on THIS work that are not waste */
  actual: number
  /** credits on THIS work that are waste */
  wastage: number
  /** credits on any work currently in 'rework' status (for this client) */
  rework: number
}

interface Props {
  workId: string
  workTitle: string
  clientId: string
  clientName: string
  userRole: 'master' | 'manager' | 'creator'
  /** Per-creator credit breakdown rendered above the Sync button. */
  creatorStats: CreatorStat[]
  /** All connected HF account labels (from hf_connections). */
  accountLabels: string[]
}

function MediaPreview({
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

export function SyncAndAssign({
  workId,
  workTitle,
  clientId,
  clientName,
  userRole,
  creatorStats,
  accountLabels,
}: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  // useTransition tracks router.refresh() as a pending React state so the
  // button stays disabled until the server-rendered tree has actually updated
  // — no flicker of "enabled" between the API response and the UI catching up.
  const [isPending, startTransition] = useTransition()

  // Button-level
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  // Modal A — picker
  const [pickerOpen, setPickerOpen] = useState(false)
  const [unassigned, setUnassigned] = useState<UnassignedGeneration[]>([])
  const [loadingUnassigned, setLoadingUnassigned] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [pickerPage, setPickerPage] = useState(1)

  // Modal B — destination. Always THIS work; no picker. The "+ Sync & Assign"
  // flow on the work detail page is scoped to this work by design.
  const [destOpen, setDestOpen] = useState(false)
  const [batchBusy, setBatchBusy] = useState<null | 'actual' | 'waste'>(null)
  const [batchError, setBatchError] = useState<string | null>(null)

  // Load the unassigned list (called after a successful sync and any time the
  // modal needs a refresh — e.g. on first manual open if user clicks again).
  const loadUnassigned = useCallback(async (silent = false) => {
    if (!silent) setLoadingUnassigned(true)
    const { data } = await supabase
      .from('generations')
      .select(
        'id, display_name, result_url, media_type, credits, hf_created_at, hf_connection_label, is_waste',
      )
      .is('client_id', null)
      .order('hf_created_at', { ascending: false })
      .limit(5000)
    const useful = (data || []).filter((g) => !g.is_waste)
    setUnassigned(useful as UnassignedGeneration[])
    if (!silent) setLoadingUnassigned(false)
  }, [supabase])

  async function handleSync() {
    setSyncError(null)
    setSyncMessage(null)
    setSelectedIds(new Set())
    setAccountFilter(null)
    setPickerPage(1)
    setPickerOpen(true)

    // Phase 1: Load existing unassigned data from DB (fast, ~500ms).
    // User sees real data almost instantly instead of 10s of shimmer.
    await loadUnassigned()

    // Phase 2: Sync from HF in background while user browses existing data.
    setSyncing(true)
    try {
      const res = await fetch('/api/hf-sync', { method: 'POST' })
      if (res.status === 409) {
        setSyncError(
          userRole === 'master'
            ? 'No Higgsfield account connected. Go to Settings to add one.'
            : "You don't have access to any Higgsfield account yet. Ask your admin to grant you access.",
        )
        return
      }
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSyncError(`Sync failed: ${data?.error || 'unknown error'}`)
        return
      }
      setSyncMessage(data?.message || 'Sync complete.')
      setSelectedIds(new Set())
      await loadUnassigned(true)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setSyncError(
        `Sync failed: ${err instanceof Error ? err.message : 'network error'}`,
      )
    } finally {
      setSyncing(false)
    }
  }

  function toggleSelect(genId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(genId)) next.delete(genId)
      else next.add(genId)
      return next
    })
  }

  const visibleUnassigned = accountFilter
    ? unassigned.filter((g) => g.hf_connection_label === accountFilter)
    : unassigned

  const pPag = paginate(visibleUnassigned, pickerPage)

  // Total credits in the unassigned picker
  const totalUnassignedCredits = visibleUnassigned.reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0,
  )

  const allVisibleSelected =
    visibleUnassigned.length > 0 &&
    visibleUnassigned.every((g) => selectedIds.has(g.id))

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleUnassigned.forEach((g) => next.delete(g.id))
      } else {
        visibleUnassigned.forEach((g) => next.add(g.id))
      }
      return next
    })
  }

  const availableAccounts = accountLabels

  function openDestination() {
    if (selectedIds.size === 0) return
    setBatchError(null)
    setDestOpen(true)
  }

  async function runBatch(mode: 'actual' | 'waste') {
    if (selectedIds.size === 0) return
    setBatchBusy(mode)
    setBatchError(null)
    const ids = Array.from(selectedIds)
    const targetWorkId = workId
    const targetClientId = clientId

    // Step 1 — assign-generation against the chosen work. The API's URL
    // workId IS the destination, so work_id is always populated. Wastage
    // and Assigned both attribute to a specific work going forward.
    const failures: string[] = []
    const assignedIds: string[] = []
    await Promise.all(
      ids.map(async (gid) => {
        const res = await fetch(
          `/api/works/${targetWorkId}/assign-generation`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              generationId: gid,
              clientId: targetClientId,
            }),
          },
        )
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          failures.push(`${gid.slice(0, 8)}: ${d?.error || res.statusText}`)
          return
        }
        assignedIds.push(gid)
      }),
    )

    // Step 2 — for Wastage, also mark each successfully-assigned generation
    // as is_waste=true. The wastage now sits inside the chosen client's
    // bucket instead of floating orphaned with client_id=NULL.
    if (mode === 'waste' && assignedIds.length > 0) {
      await Promise.all(
        assignedIds.map(async (gid) => {
          const res = await fetch(`/api/generations/${gid}/waste`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_waste: true }),
          })
          if (!res.ok) {
            const d = await res.json().catch(() => ({}))
            failures.push(
              `${gid.slice(0, 8)} (waste): ${d?.error || res.statusText}`,
            )
          }
        }),
      )
    }

    setBatchBusy(null)

    // Total bust — nothing landed. Stay on Modal B so the user can fix.
    if (failures.length > 0 && assignedIds.length === 0) {
      setBatchError(
        `All ${failures.length} failed: ${failures.slice(0, 3).join('; ')}`,
      )
      return
    }

    // Partial failure — at least one row landed, but others didn't. DON'T
    // navigate; if we did, the error message would be hidden by the modal
    // closing + the page changing. Surface the error and let the user
    // close manually, or retry against the failures.
    if (failures.length > 0) {
      setBatchError(
        `${failures.length} of ${ids.length} failed: ${failures.slice(0, 3).join('; ')}`,
      )
      // Refresh the picker's unassigned list so the successfully-attributed
      // rows fall out of it.
      await loadUnassigned()
      // Drop the selection so the user re-picks deliberately.
      setSelectedIds(new Set())
      return
    }

    // Full success — close modals and refresh in place.
    setDestOpen(false)
    setPickerOpen(false)
    setSelectedIds(new Set())
    // Wrapped in a transition so the modal buttons stay disabled until the
    // server-rendered tables actually render.
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <>
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white text-sm">Sync &amp; Assign</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Pull fresh generations from Higgsfield, then pick which ones to
            attribute to a client.
          </p>
        </div>

        {/* SYNC BUTTON */}
        <div className="flex flex-col items-center px-6 py-5 gap-3 border-b border-neutral-800">
          <Button
            onClick={handleSync}
            disabled={syncing || isPending}
            size="lg"
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold min-w-[14rem]"
          >
            {syncing || isPending ? (
              <>
                <RefreshCw className="size-4 mr-2 animate-spin" />
                {syncing ? 'Syncing…' : 'Updating…'}
              </>
            ) : (
              <>
                <RefreshCw className="size-4 mr-2" />
                Sync &amp; Assign
              </>
            )}
          </Button>
          {syncMessage && !syncError && (
            <p className="text-xs text-lime-400 text-center max-w-md">
              ✓ {syncMessage}
            </p>
          )}
          {syncError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs flex items-center justify-between gap-2 max-w-md w-full">
              <span>{syncError}</span>
              {syncError.includes('Settings') && (
                <a
                  href="/app/settings"
                  className="text-lime-400 hover:underline shrink-0"
                >
                  Open Settings →
                </a>
              )}
            </div>
          )}
        </div>

        {/* PER-CREATOR STATS */}
        <div className="flex-1 overflow-auto">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Credit breakdown by user
            </h3>
            <span className="text-[10px] text-neutral-500">
              On {clientName}
            </span>
          </div>
          {creatorStats.length === 0 ? (
            <div className="p-6 text-center text-neutral-500 text-xs">
              No credits attributed by anyone yet.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800">
              <div className="px-4 py-1.5 grid grid-cols-[1fr_repeat(3,minmax(0,4rem))] gap-2 text-[10px] uppercase tracking-wider text-neutral-500">
                <div>User</div>
                <div className="text-right text-lime-400">Actual</div>
                <div className="text-right text-yellow-400">Wastage</div>
                <div className="text-right text-orange-400">Rework</div>
              </div>
              {creatorStats.map((s) => (
                <div
                  key={s.userId}
                  className="px-4 py-2 grid grid-cols-[1fr_repeat(3,minmax(0,4rem))] gap-2 items-center text-xs"
                >
                  <div className="min-w-0 truncate font-medium text-white">
                    {s.name}
                  </div>
                  <div className="text-right font-mono text-lime-300">
                    {s.actual > 0 ? s.actual.toFixed(1) : '—'}
                  </div>
                  <div className="text-right font-mono text-yellow-300">
                    {s.wastage > 0 ? s.wastage.toFixed(1) : '—'}
                  </div>
                  <div className="text-right font-mono text-orange-300">
                    {s.rework > 0 ? s.rework.toFixed(1) : '—'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* MODAL A — picker */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setPickerOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-6xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* STICKY HEADER */}
            <div className="sticky top-0 z-10 bg-neutral-950 border-b border-neutral-800 px-4 py-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-semibold text-white text-sm">
                      Pick generations to attribute
                    </h2>
                    <span className="text-sm font-bold text-yellow-400 font-mono">
                      {totalUnassignedCredits.toFixed(1)} cr
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {selectedIds.size} of {visibleUnassigned.length} selected
                    {accountFilter ? ` · filtered: ${accountFilter}` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPickerOpen(false)}
                    disabled={batchBusy !== null || isPending}
                    className="h-8 text-xs"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={openDestination}
                    disabled={
                      selectedIds.size === 0 ||
                      batchBusy !== null ||
                      isPending
                    }
                    className="h-8 text-xs bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    Assign ({selectedIds.size})
                  </Button>
                </div>
              </div>

              {/* Filter chips */}
              {availableAccounts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider mr-1">
                    Account:
                  </span>
                  <button
                    type="button"
                    onClick={() => { setAccountFilter(null); setPickerPage(1) }}
                    className={`text-xs px-2 py-0.5 rounded transition-colors ${
                      accountFilter === null
                        ? 'bg-lime-400 text-black'
                        : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                    }`}
                  >
                    All
                  </button>
                  {availableAccounts.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setAccountFilter(label); setPickerPage(1) }}
                      className={`text-xs px-2 py-0.5 rounded transition-colors ${
                        accountFilter === label
                          ? 'bg-lime-400 text-black'
                          : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="text-neutral-700 mx-1">·</span>
                  <button
                    type="button"
                    onClick={toggleSelectAllVisible}
                    disabled={visibleUnassigned.length === 0}
                    className="text-xs text-lime-400 hover:underline disabled:text-neutral-600 disabled:no-underline"
                  >
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
              )}
            </div>

            {/* LIST */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                {syncError ? (
                <div className="p-4">
                  <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-3 rounded text-sm flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium mb-0.5">Sync failed</div>
                      <div className="text-xs opacity-90">{syncError}</div>
                    </div>
                    {syncError.includes('Settings') && (
                      <a
                        href="/app/settings"
                        className="text-lime-400 hover:underline text-xs shrink-0 whitespace-nowrap"
                      >
                        Open Settings →
                      </a>
                    )}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleSync}
                      disabled={syncing || isPending}
                      className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                    >
                      <RefreshCw
                        className={`size-4 mr-1.5 ${syncing ? 'animate-spin' : ''}`}
                      />
                      {syncing ? 'Retrying…' : 'Retry sync'}
                    </Button>
                  </div>
                </div>
              ) : loadingUnassigned ? (
                <>
                  <div className="px-4 py-2 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-2">
                    <RefreshCw className="size-3.5 text-lime-400 animate-spin" />
                    <span className="text-xs text-neutral-400">Loading…</span>
                  </div>
                  <ul className="divide-y divide-neutral-800">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <li
                        key={i}
                        className="px-3 py-2 flex items-center gap-3 animate-pulse"
                      >
                        <div className="size-5 rounded border-2 border-neutral-700 bg-neutral-900 shrink-0" />
                        <div className="w-14 h-10 rounded bg-neutral-800 shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="h-3 w-1/2 bg-neutral-800 rounded" />
                          <div className="h-2 w-1/3 bg-neutral-900 rounded" />
                        </div>
                        <div className="h-3 w-10 bg-neutral-800 rounded shrink-0" />
                      </li>
                    ))}
                  </ul>
                </>
              ) : visibleUnassigned.length === 0 ? (
                <div className="p-8 text-center text-neutral-500 text-sm">
                  {syncing ? (
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="size-3.5 text-lime-400 animate-spin" />
                      <span className="text-xs text-neutral-400">
                        Pulling fresh generations from Higgsfield…
                      </span>
                    </div>
                  ) : (
                    <>
                      <p>
                        {syncMessage
                          ? "Synced — but nothing new is waiting."
                          : 'No unassigned generations.'}
                      </p>
                      <p className="text-xs mt-1">
                        {accountFilter
                          ? 'Try clearing the account filter or sync again.'
                          : 'Click Sync again later for new entries.'}
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <>
                {syncing && (
                  <div className="px-4 py-1.5 border-b border-neutral-800 bg-neutral-900/40 flex items-center gap-2">
                    <RefreshCw className="size-3 text-lime-400 animate-spin" />
                    <span className="text-[11px] text-neutral-400">
                      Syncing from Higgsfield — new items will appear shortly…
                    </span>
                  </div>
                )}
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-neutral-800">
                    {pPag.slice.map((g) => {
                      const checked = selectedIds.has(g.id)
                      return (
                        <tr
                          key={g.id}
                          onClick={() => toggleSelect(g.id)}
                          className={`cursor-pointer transition-colors ${
                            checked
                              ? 'bg-lime-950/30'
                              : 'hover:bg-neutral-900/60'
                          }`}
                        >
                          <td className="px-3 py-2 w-8">
                            <div
                              className={`size-5 rounded border-2 flex items-center justify-center transition-colors ${
                                checked
                                  ? 'border-lime-400 bg-lime-400'
                                  : 'border-neutral-600 bg-transparent'
                              }`}
                            >
                              {checked && (
                                <Check className="size-3 text-black" />
                              )}
                            </div>
                          </td>
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
                            {g.hf_connection_label && (
                              <div className="text-[10px] text-neutral-500 mt-0.5">
                                from{' '}
                                <span className="text-lime-400">
                                  {g.hf_connection_label}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <span
                              className={`font-bold ${
                                parseFloat(g.credits) > 0
                                  ? 'text-orange-400'
                                  : 'text-neutral-500'
                              }`}
                            >
                              {parseFloat(g.credits) > 0
                                ? parseFloat(g.credits).toFixed(1)
                                : 'free'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                </>
              )}
              </div>
              {!syncError && !loadingUnassigned && visibleUnassigned.length > 0 && (
                <PaginationButtons page={pPag.page} totalPages={pPag.totalPages} total={pPag.total} onPageChange={setPickerPage} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL B — destination */}
      {destOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4"
          onClick={() => !batchBusy && !isPending && setDestOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-md w-full flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-white text-sm">
                  Assign {selectedIds.size} generation
                  {selectedIds.size === 1 ? '' : 's'}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pick the destination client, then mark as actual usage or
                  wastage.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  !batchBusy && !isPending && setDestOpen(false)
                }
                disabled={batchBusy !== null || isPending}
                className="p-1 rounded hover:bg-neutral-800 transition-colors disabled:opacity-40"
              >
                <X className="size-4 text-neutral-400" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  Destination work
                </div>
                <div className="mt-1 px-3 py-2 rounded border border-neutral-800 bg-neutral-900/40">
                  <div className="text-sm font-medium text-white truncate">
                    {workTitle}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5 truncate">
                    {clientName}
                  </div>
                </div>
              </div>

              {batchError && (
                <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-xs">
                  {batchError}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-neutral-800 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => runBatch('waste')}
                disabled={
                  batchBusy !== null || isPending || selectedIds.size === 0
                }
                className="text-yellow-400 border-yellow-700 hover:bg-yellow-950"
              >
                {batchBusy === 'waste'
                  ? 'Marking…'
                  : isPending
                    ? 'Updating…'
                    : 'Wastage'}
              </Button>
              <Button
                onClick={() => runBatch('actual')}
                disabled={
                  batchBusy !== null || isPending || selectedIds.size === 0
                }
                className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
              >
                {batchBusy === 'actual'
                  ? 'Assigning…'
                  : isPending
                    ? 'Updating…'
                    : 'Assign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
