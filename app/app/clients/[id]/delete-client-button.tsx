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

interface Props {
  clientId: string
  clientName: string
}

export function DeleteClientButton({ clientId, clientName }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.from('clients').delete().eq('id', clientId)
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    startTransition(() => {
      router.push('/app/clients')
      router.refresh()
    })
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className="bg-red-700 hover:bg-red-600 text-white" />
          }
        >
          Delete Client
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-neutral-950 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Delete {clientName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              This permanently deletes the client. All generations assigned to it
              will be unassigned (their client_id becomes NULL) and reappear in
              the unassigned table. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy || isPending}
              className="bg-red-700 hover:bg-red-600 text-white"
            >
              {busy ? 'Deleting…' : isPending ? 'Updating…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-red-400 text-sm">Delete failed: {error}</p>}
    </div>
  )
}
