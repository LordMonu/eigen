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
import { Trash2 } from 'lucide-react'

interface Props {
  workId: string
  workTitle: string
}

export function DeleteWorkButton({ workId, workTitle }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleDelete() {
    setBusy(true)
    const res = await fetch(`/api/works/${workId}`, { method: 'DELETE' })
    if (res.ok) {
      // router.push + refresh wrapped in a transition so the button stays
      // disabled until we've actually navigated away.
      startTransition(() => {
        router.push('/app/works')
        router.refresh()
      })
      // Leave busy=true; this component unmounts on navigation.
    } else {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Delete failed')
      setBusy(false)
    }
  }

  const disabled = busy || isPending

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            className="text-red-400 border-red-900 hover:bg-red-950"
          />
        }
      >
        <Trash2 className="size-4 mr-1" />
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-neutral-950 border-neutral-800">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Delete &ldquo;{workTitle}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-neutral-400">
            Generations assigned to this work will be unassigned (work_id → null).
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={disabled}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            {disabled ? 'Deleting…' : 'Delete Work'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
