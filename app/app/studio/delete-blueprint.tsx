'use client'

// app/app/studio/delete-blueprint.tsx — trash icon + confirm dialog.
//
// Only rendered when canDelete is true (computed server-side from role +
// ownership). If this was the last variant in the batch, navigates to the
// Studio home — otherwise stays on the batch page and refreshes.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
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

interface DeleteBlueprintProps {
  blueprintId: string
  /** Including the variant being deleted — used to decide whether to navigate
   *  to the Studio home (last in batch) or refresh in place. */
  totalInBatch: number
  /** Short display label for the confirm dialog ("Hook A — product-first"). */
  variantLabel: string
}

export function DeleteBlueprint({
  blueprintId,
  totalInBatch,
  variantLabel,
}: DeleteBlueprintProps) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/studio/blueprint/${blueprintId}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Delete failed')

      // Last variant → bounce to Studio home; otherwise refresh in place.
      // Wrap nav in a transition so the button stays disabled until React has
      // actually navigated/reloaded.
      startTransition(() => {
        if (totalInBatch <= 1) {
          router.push('/app/studio')
        } else {
          router.refresh()
        }
      })
      // Leave busy=true; the parent unmounts (last in batch) or refresh
      // re-renders this card without the deleted blueprint.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setBusy(false)
    }
  }

  const disabled = busy || isPending

  return (
    // Uncontrolled — base-ui handles open/close internally. We don't need to
    // close it on success (the parent unmounts via router.push, or refreshes
    // via router.refresh which unmounts this card's tree).
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            aria-label={`Delete variant ${variantLabel}`}
            className="text-neutral-500 hover:text-red-400 hover:bg-red-950/20"
          />
        }
      >
        <Trash2 className="size-3.5" />
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-neutral-950 border-neutral-800">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            Delete &ldquo;{variantLabel}&rdquo;?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-neutral-400">
            This variant and its virality score will be permanently removed.
            This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={disabled}
            className="bg-red-700 hover:bg-red-600 text-white"
          >
            {disabled ? 'Deleting…' : 'Delete variant'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
