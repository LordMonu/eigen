'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  isDefault?: boolean
}

export function DeleteClientButton({ clientId, clientName, isDefault = false }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Delete failed')
      setBusy(false)
      return
    }
    startTransition(() => {
      router.push('/app/clients')
      router.refresh()
    })
  }

  if (isDefault) {
    return (
      <div className="space-y-2">
        <Button variant="destructive" className="bg-neutral-800 text-neutral-500 cursor-not-allowed" disabled>
          Archive Client
        </Button>
        <p className="text-neutral-600 text-xs">R&D client cannot be archived</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button variant="destructive" className="bg-red-700 hover:bg-red-600 text-white" />
          }
        >
          Archive Client
        </AlertDialogTrigger>
        <AlertDialogContent className="bg-neutral-950 border-neutral-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">
              Archive {clientName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-neutral-400">
              This archives the client and all its works. All assigned credits
              and generations will remain allocated. The client will appear
              greyed out in lists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy || isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={busy || isPending}
              className="bg-red-700 hover:bg-red-600 text-white"
            >
              {busy ? 'Archiving…' : isPending ? 'Updating…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-red-400 text-sm">Archive failed: {error}</p>}
    </div>
  )
}
