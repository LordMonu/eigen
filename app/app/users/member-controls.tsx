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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

type Role = 'master' | 'manager' | 'creator'

const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  manager: 'Manager',
  creator: 'Creator',
}

interface Props {
  membershipId: string
  currentRole: Role
  userRole: Role
  fullName: string
  isYou: boolean
  /** true when this is the org's last master — block demotion/removal. */
  isLastMaster: boolean
}

// Inline controls for an existing active member: change role + remove.
// Master-only for edit/delete; managers see read-only view.
export function MemberControls({
  membershipId,
  currentRole,
  userRole,
  fullName,
  isYou,
  isLastMaster,
}: Props) {
  const router = useRouter()
  const [role, setRole] = useState<Role>(currentRole)
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function changeRole(next: Role) {
    if (next === role) return
    if (isLastMaster && next !== 'master') {
      setError(
        'This is the only master in the org. Promote another member to master first.'
      )
      return
    }
    setBusy(true)
    setError(null)
    setRole(next) // optimistic
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('memberships')
        .update({ role: next })
        .eq('id', membershipId)
      if (err) {
        setError(err.message)
        setRole(currentRole) // revert
      } else {
        startTransition(() => {
          router.refresh()
        })
      }
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (isLastMaster) {
      setError(
        'Cannot remove the only master in the org. Promote another member to master first.'
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: err } = await supabase
        .from('memberships')
        .delete()
        .eq('id', membershipId)
      if (err) {
        setError(err.message)
      } else {
        startTransition(() => {
          router.refresh()
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const canEdit = can(userRole, 'users_role_edit', 'edit')
  const canRemove = can(userRole, 'users_remove', 'delete')

  if (!canEdit && !canRemove) {
    return (
      <div className="text-xs text-neutral-500">
        {ROLE_LABELS[role]}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Select
          value={role}
          onValueChange={(v) => changeRole(v as Role)}
          disabled={busy || isPending || !canEdit}
        >
          <SelectTrigger className="w-28 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue>
              {(v) => {
                const val = v as Role | null
                return val ? ROLE_LABELS[val] : 'Role'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="master">Master</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="creator">Creator</SelectItem>
          </SelectContent>
        </Select>

        {canRemove && (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || isPending || isLastMaster}
                  className="h-8 text-red-400 border-red-900 hover:bg-red-950 disabled:opacity-40"
                />
              }
            >
            Remove
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-neutral-950 border-neutral-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white">
                Remove {fullName}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-neutral-400">
                {isYou
                  ? 'This will remove YOUR access to the org. You can rejoin later if someone re-invites you.'
                  : `${fullName} will lose access to the org. They can request to rejoin later.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy || isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={remove}
                disabled={busy || isPending}
                className="bg-red-700 hover:bg-red-600 text-white"
              >
                {busy ? 'Removing…' : isPending ? 'Updating…' : 'Remove'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {isYou && (
        <span className="text-[10px] uppercase tracking-wider text-neutral-500">
          (you)
        </span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
