'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_COLORS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface Props {
  clientId: string
  currentStatus: ClientStatus
}

export function StatusDropdown({ clientId, currentStatus }: Props) {
  const router = useRouter()
  // Local state seeded once from the server-rendered prop. The client
  // component instance survives router.refresh() (same mount), so the value
  // the user just picked stays put through the refresh — no flicker, no
  // useEffect-driven re-sync (which trips react-hooks/set-state-in-effect).
  const [status, setStatus] = useState<ClientStatus>(currentStatus)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleChange(value: string) {
    const newStatus = value as ClientStatus
    if (newStatus === status) return
    const prev = status
    setStatus(newStatus)
    setBusy(true)
    setError(null)

    try {
      const supabase = createClient()
      // Single atomic RPC: updates the client AND cascades work statuses
      // (paused/ended → lock all non-completed works; ongoing/trial/in_talk/
      // outreach → unlock paused works). Replaces the previous direct
      // .update() call which had no cascade. See supabase/client-work-cascade.sql.
      const { data, error: rpcError } = await supabase.rpc(
        'update_client_status_with_cascade',
        { p_client_id: clientId, p_new_status: newStatus },
      )

      if (rpcError) {
        console.error('[status-dropdown] rpc failed:', rpcError)
        setStatus(prev)
        // Postgres ERRCODEs: 42501 = caller not permitted; 22023 = invalid
        // status string. Map both to friendly messages so the user sees
        // something actionable instead of the raw PG error.
        if (rpcError.code === '42501') {
          setError('Not permitted — you are not a member of this client’s organization')
        } else if (rpcError.code === '22023') {
          setError('Invalid status')
        } else {
          setError(rpcError.message)
        }
        return
      }
      // data is the JSONB return: { client_id, status, works_affected }.
      // Soft logging only — we don't surface the count unless > 0 below.
      const worksAffected =
        data && typeof data === 'object' && 'works_affected' in data
          ? Number((data as { works_affected: number }).works_affected) || 0
          : 0
      if (worksAffected > 0) {
        // Helpful breadcrumb in dev so the cascade is observable.
        console.log(
          `[status-dropdown] cascade updated ${worksAffected} work(s)`,
        )
      }
      // Log the status change (non-blocking, best-effort)
      fetch('/api/activity-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'client', entityId: clientId, action: 'status_changed', fromValue: prev, toValue: newStatus }),
      }).catch(() => {})

      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setStatus(prev)
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Select
        value={status}
        onValueChange={(v) => handleChange(v as string)}
        disabled={busy}
      >
        <SelectTrigger
          className={`w-36 h-8 text-xs border ${CLIENT_STATUS_COLORS[status]}`}
        >
          <SelectValue>
            {(v) => {
              const val = v as ClientStatus | null
              return val ? CLIENT_STATUS_LABELS[val] : 'Status'
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CLIENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {CLIENT_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {(busy || isPending) && (
        <span className="text-[10px] text-neutral-500">Saving…</span>
      )}
      {error && (
        <span className="text-[10px] text-red-400 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  )
}
