'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
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
import { AddAccountPanel } from './add-account-panel'

interface ConnectionRow {
  id: string
  label: string
  hf_email: string | null
  is_active: boolean
  created_at: string
}

export function ConnectionsList({
  connections,
}: {
  orgId: string
  connections: ConnectionRow[]
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function toggleEnabled(id: string, next: boolean) {
    setBusyId(id)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('hf_connections')
        .update({ is_active: next })
        .eq('id', id)
      if (error) {
        setError(error.message)
        return
      }
      startTransition(() => {
        router.refresh()
      })
    } finally {
      setBusyId(null)
    }
  }

  async function remove(id: string) {
    setBusyId(id)
    setError(null)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('hf_connections')
        .delete()
        .eq('id', id)
      if (error) {
        setError(error.message)
        return
      }
      startTransition(() => {
        router.refresh()
      })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div>
      {connections.length === 0 ? (
        <div className="p-8 text-center text-neutral-500">
          <p>No Higgsfield accounts connected yet.</p>
          <p className="text-sm mt-1">
            Add one to enable Sync &amp; Assign.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-neutral-800">
          {connections.map((c) => (
            <div
              key={c.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white truncate">
                    {c.label}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${
                      c.is_active
                        ? 'bg-lime-900/40 text-lime-300 border-lime-700'
                        : 'bg-neutral-900 text-neutral-500 border-neutral-700'
                    }`}
                  >
                    {c.is_active ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                {c.hf_email && (
                  <div className="text-xs text-neutral-500">{c.hf_email}</div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === c.id || isPending}
                  onClick={() => toggleEnabled(c.id, !c.is_active)}
                  className="h-8"
                >
                  {busyId === c.id
                    ? '…'
                    : isPending
                      ? '…'
                      : c.is_active
                        ? 'Disable'
                        : 'Enable'}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === c.id || isPending}
                        className="h-8 text-red-400 border-red-900 hover:bg-red-950"
                      />
                    }
                  >
                    Remove
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-neutral-950 border-neutral-800">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-white">
                        Remove {c.label}?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-neutral-400">
                        Sync will stop using this account. Existing synced
                        generations stay. You can reconnect it later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel
                        disabled={busyId === c.id || isPending}
                      >
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => remove(c.id)}
                        disabled={busyId === c.id || isPending}
                        className="bg-red-700 hover:bg-red-600 text-white"
                      >
                        {busyId === c.id
                          ? 'Removing…'
                          : isPending
                            ? 'Updating…'
                            : 'Remove'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-sm text-red-400 border-t border-neutral-800">
          {error}
        </div>
      )}

      {addOpen ? (
        <AddAccountPanel
          onCancel={() => setAddOpen(false)}
          onDone={() => {
            setAddOpen(false)
            startTransition(() => {
              router.refresh()
            })
          }}
        />
      ) : (
        <div className="px-4 py-3 border-t border-neutral-800">
          <Button
            onClick={() => setAddOpen(true)}
            disabled={isPending}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            + Add Higgsfield account
          </Button>
        </div>
      )}
    </div>
  )
}
