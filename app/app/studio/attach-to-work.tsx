'use client'

// app/app/studio/attach-to-work.tsx — link or unlink a blueprint to an org work.
//
// Uses the base-ui Select component (function-child SelectValue, __none sentinel
// for "not attached" since empty-string item values are rejected by base-ui).
// Optimistic: updates local state immediately, rolls back on PATCH failure.

import { useState, useTransition } from 'react'
import { Link2, Check, AlertCircle, Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const NONE = '__none'

interface WorkOption {
  id: string
  label: string
}

interface AttachToWorkProps {
  blueprintId: string
  currentWorkId: string | null
  works: WorkOption[]
}

export function AttachToWork({
  blueprintId,
  currentWorkId,
  works,
}: AttachToWorkProps) {
  const [workId, setWorkId] = useState<string>(currentWorkId ?? NONE)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleChange(val: string) {
    // Optimistic: update local state first so the trigger reflects the user's
    // choice instantly. Roll back on PATCH failure.
    const previous = workId
    setWorkId(val)
    setError(null)
    setSaved(false)

    const nextWorkId = val === NONE ? null : val

    startTransition(async () => {
      try {
        const res = await fetch(`/api/studio/blueprint/${blueprintId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workId: nextWorkId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to attach')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err: unknown) {
        // Roll back to the previous selection so the trigger matches reality.
        setWorkId(previous)
        setError(err instanceof Error ? err.message : 'Failed to attach')
      }
    })
  }

  // Status icon shown on the right of the trigger row. Saved > error > pending.
  let statusEl: React.ReactNode = null
  if (saved) {
    statusEl = (
      <span className="inline-flex items-center gap-1 text-xs text-lime-400">
        <Check className="size-3" />
        Saved
      </span>
    )
  } else if (error) {
    statusEl = (
      <span
        className="inline-flex items-center gap-1 text-xs text-red-400"
        title={error}
      >
        <AlertCircle className="size-3" />
        {error.length > 40 ? `${error.slice(0, 40)}…` : error}
      </span>
    )
  } else if (isPending) {
    statusEl = (
      <span className="inline-flex items-center gap-1 text-xs text-neutral-500">
        <Loader2 className="size-3 animate-spin" />
        Saving…
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 min-w-0">
      <Link2 className="size-3.5 text-neutral-500 shrink-0" />
      <span className="text-xs text-neutral-500 shrink-0">Work</span>
      <Select value={workId} onValueChange={(v) => handleChange(v as string)}>
        {/* `disabled` belongs on SelectTrigger — base-ui Select.Root doesn't
            accept it (it's purely state). Putting it on Root was a no-op,
            which let rapid changes overlap PATCHes and could leave the DB
            in the last-resolved (not last-clicked) state. */}
        <SelectTrigger
          size="sm"
          disabled={isPending}
          className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white max-w-56 min-w-32"
        >
          <SelectValue>
            {(v: unknown) => {
              const val = (v as string) ?? NONE
              if (val === NONE) return 'None'
              return works.find((w) => w.id === val)?.label ?? 'Unknown'
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {works.map((w) => (
            <SelectItem key={w.id} value={w.id}>
              {w.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {statusEl}
    </div>
  )
}
