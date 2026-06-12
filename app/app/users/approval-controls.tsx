'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { can } from '@/lib/rbac'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Check } from 'lucide-react'
import type { Role } from '@/lib/auth-helpers'

interface HfConnection {
  id: string
  label: string
  hf_email: string | null
}

interface ApprovalControlsProps {
  membershipId: string
  userRole: Role
  connections: HfConnection[]
}

export function ApprovalControls({ membershipId, userRole, connections }: ApprovalControlsProps) {
  const router = useRouter()
  const [role, setRole] = useState<'manager' | 'creator'>('creator')
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedConnIds, setSelectedConnIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  function toggleConn(connId: string) {
    setSelectedConnIds(prev => {
      const next = new Set(prev)
      if (next.has(connId)) next.delete(connId)
      else next.add(connId)
      return next
    })
  }

  function selectAllConns() {
    setSelectedConnIds(new Set(connections.map(c => c.id)))
  }

  function clearConns() {
    setSelectedConnIds(new Set())
  }

  async function handleConfirmApprove() {
    setBusy(true)
    setError(null)
    const supabase = createClient()

    const { error: rpcErr } = await supabase.rpc('approve_membership_with_grants', {
      p_membership_id: membershipId,
      p_role: role,
      p_connection_ids: Array.from(selectedConnIds),
    })

    if (rpcErr) {
      setError(rpcErr.message)
      setBusy(false)
      return
    }

    setBusy(false)
    setDialogOpen(false)
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleReject() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('memberships')
      .update({ status: 'rejected' })
      .eq('id', membershipId)
    if (err) {
      setError(err.message)
      setBusy(false)
      return
    }
    setBusy(false)
    startTransition(() => {
      router.refresh()
    })
  }

  function openApproveDialog() {
    setSelectedConnIds(new Set())
    setError(null)
    setDialogOpen(true)
  }

  const canApprove = can(userRole, 'users_approvals', 'edit')

  if (!canApprove) {
    return <div className="text-xs text-neutral-500">Pending</div>
  }

  return (
    <>
      <div className="flex gap-2 items-center">
        <Select
          value={role}
          onValueChange={(v) => setRole(v as 'manager' | 'creator')}
          disabled={busy || isPending}
        >
          <SelectTrigger className="w-28 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue>
              {(v) => {
                const val = v as string | null
                if (!val) return 'Role'
                return val.charAt(0).toUpperCase() + val.slice(1)
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="creator">Creator</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={openApproveDialog}
          disabled={busy || isPending}
          className="bg-green-600 hover:bg-green-500 text-white h-8"
        >
          {isPending ? 'Updating…' : 'Approve'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleReject}
          disabled={busy || isPending}
          className="h-8 text-red-400 border-red-900 hover:bg-red-950"
        >
          {busy ? 'Rejecting…' : isPending ? 'Updating…' : 'Reject'}
        </Button>
        {error && !dialogOpen && (
          <span className="text-xs text-red-400 ml-2">{error}</span>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle>Approve as {role}</DialogTitle>
            <DialogDescription className="text-neutral-400">
              Pick which Higgsfield accounts this user can sync from.
              You can change this later from Higgsfield Account Access below.
            </DialogDescription>
          </DialogHeader>

          {connections.length === 0 ? (
            <div className="bg-yellow-950/30 border border-yellow-900 text-yellow-300 text-sm px-3 py-2 rounded">
              No Higgsfield accounts connected yet. You can still approve the user
              and grant accounts later from Settings → Higgsfield Account Access.
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-neutral-300">
                  {selectedConnIds.size} of {connections.length} selected
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllConns}
                    className="text-xs text-lime-400 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-neutral-700">·</span>
                  <button
                    type="button"
                    onClick={clearConns}
                    className="text-xs text-neutral-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {connections.map(conn => {
                  const checked = selectedConnIds.has(conn.id)
                  return (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => toggleConn(conn.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors ${
                        checked
                          ? 'border-lime-800 bg-lime-950/30'
                          : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                      }`}
                    >
                      <div className="min-w-0 text-left">
                        <div className="text-sm font-medium text-white truncate">
                          {conn.label}
                        </div>
                        {conn.hf_email && (
                          <div className="text-xs text-neutral-500 truncate">
                            {conn.hf_email}
                          </div>
                        )}
                      </div>
                      {checked ? (
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
            </div>
          )}

          {error && (
            <div className="bg-red-950/40 border border-red-900 text-red-300 text-sm px-3 py-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={busy || isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmApprove}
              disabled={busy || isPending}
              className="bg-green-600 hover:bg-green-500 text-white"
            >
              {busy ? 'Approving…' : isPending ? 'Updating…' : 'Approve & Grant Access'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
