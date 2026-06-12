'use client'

// app/app/users/member-hf-access.tsx
// "Grant HF access" button per active member row. Opens a Dialog (modal)
// with the per-connection toggle list, "Grant all" / "Revoke all" controls
// and an inline error region. Replaces the earlier inline popover which
// risked clipping under overflow boundaries and was harder to scan.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Check, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface HfConnection {
  id: string
  label: string
  hf_email: string | null
}

interface Grant {
  id: string
  connection_id: string
  user_id: string
}

interface Props {
  orgId: string
  memberUserId: string
  memberFullName: string
  /** false when the member's role doesn't take grants (e.g. master is auto). */
  enabled: boolean
  connections: HfConnection[]
  initialGrants: Grant[]
}

export function MemberHfAccess({
  orgId,
  memberUserId,
  memberFullName,
  enabled,
  connections,
  initialGrants,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [grants, setGrants] = useState<Grant[]>(initialGrants)
  const [busy, setBusy] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const memberGrants = grants.filter((g) => g.user_id === memberUserId)
  const granted = (connId: string) =>
    memberGrants.some((g) => g.connection_id === connId)
  const grantIdFor = (connId: string) =>
    memberGrants.find((g) => g.connection_id === connId)?.id

  async function toggle(connId: string) {
    const key = `${memberUserId}:${connId}`
    setBusy(key)
    setError(null)
    const supabase = createClient()
    const existingId = grantIdFor(connId)
    const snapshot = grants

    if (existingId) {
      // Optimistic delete with revert-on-error.
      setGrants((prev) => prev.filter((g) => g.id !== existingId))
      const { error: err } = await supabase
        .from('hf_connection_grants')
        .delete()
        .eq('id', existingId)
      if (err) {
        setGrants(snapshot)
        setError(err.message)
        setBusy(null)
        return
      }
    } else {
      const { data, error: err } = await supabase
        .from('hf_connection_grants')
        .insert({ org_id: orgId, connection_id: connId, user_id: memberUserId })
        .select('id, connection_id, user_id')
        .single()
      if (err) {
        setError(err.message)
        setBusy(null)
        return
      }
      if (data) setGrants((prev) => [...prev, data])
    }
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function grantAll() {
    setBusy(`all:${memberUserId}`)
    setError(null)
    const missing = connections.filter((c) => !granted(c.id))
    if (missing.length === 0) {
      setBusy(null)
      return
    }
    const supabase = createClient()
    const rows = missing.map((c) => ({
      org_id: orgId,
      connection_id: c.id,
      user_id: memberUserId,
    }))
    const { data, error: err } = await supabase
      .from('hf_connection_grants')
      .insert(rows)
      .select('id, connection_id, user_id')
    if (err) {
      setError(err.message)
      setBusy(null)
      return
    }
    if (data) setGrants((prev) => [...prev, ...data])
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function revokeAll() {
    setBusy(`all:${memberUserId}`)
    setError(null)
    if (memberGrants.length === 0) {
      setBusy(null)
      return
    }
    const supabase = createClient()
    const snapshot = grants
    setGrants((prev) => prev.filter((g) => g.user_id !== memberUserId))
    const { error: err } = await supabase
      .from('hf_connection_grants')
      .delete()
      .in('id', memberGrants.map((g) => g.id))
    if (err) {
      setGrants(snapshot)
      setError(err.message)
      setBusy(null)
      return
    }
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  if (connections.length === 0) return null

  if (!enabled) {
    return (
      <div className="text-[10px] text-neutral-500 uppercase tracking-wider">
        Master access
      </div>
    )
  }

  const grantedCount = memberGrants.length
  const dialogDisabled = busy !== null || isPending

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 px-3 border-neutral-700 hover:border-lime-700 hover:bg-lime-950/20 text-xs gap-1.5"
      >
        <Settings2 className="size-3.5 text-lime-400" />
        <span className="text-neutral-300">HF access</span>
        <span className="font-mono text-lime-400">
          {grantedCount}/{connections.length}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-lime-400" />
              Higgsfield account access
            </DialogTitle>
            <DialogDescription className="text-neutral-400">
              Pick which Higgsfield accounts{' '}
              <span className="text-white">{memberFullName}</span> can sync
              from. They&apos;ll only see generations from accounts checked
              here.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-neutral-300">
                <span className="text-lime-400 font-mono">{grantedCount}</span>
                <span className="text-neutral-500">
                  {' '}
                  of {connections.length}{' '}
                </span>
                selected
              </div>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  onClick={grantAll}
                  disabled={dialogDisabled || grantedCount === connections.length}
                  className="text-lime-400 hover:underline disabled:text-neutral-700 disabled:no-underline"
                >
                  Grant all
                </button>
                <span className="text-neutral-700">·</span>
                <button
                  type="button"
                  onClick={revokeAll}
                  disabled={dialogDisabled || grantedCount === 0}
                  className="text-red-400 hover:underline disabled:text-neutral-700 disabled:no-underline"
                >
                  Revoke all
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {connections.map((conn) => {
                const isGranted = granted(conn.id)
                const key = `${memberUserId}:${conn.id}`
                const rowBusy =
                  busy === key || busy === `all:${memberUserId}` || isPending
                return (
                  <button
                    key={conn.id}
                    type="button"
                    disabled={rowBusy}
                    onClick={() => toggle(conn.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors text-left ${
                      isGranted
                        ? 'border-lime-800 bg-lime-950/30'
                        : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                    } ${rowBusy ? 'opacity-60' : ''}`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-white truncate">
                        {conn.label}
                      </div>
                      {conn.hf_email && (
                        <div className="text-xs text-neutral-500 truncate">
                          {conn.hf_email}
                        </div>
                      )}
                    </div>
                    {isGranted ? (
                      <div className="size-5 rounded-full bg-lime-400 flex items-center justify-center shrink-0">
                        <Check className="size-3 text-black" />
                      </div>
                    ) : (
                      <div className="size-5 rounded-full border-2 border-neutral-600 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>

            {error && (
              <div className="bg-red-950/40 border border-red-900 text-red-300 text-xs px-3 py-2 rounded">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-neutral-800">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={dialogDisabled}
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
