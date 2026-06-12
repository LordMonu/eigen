'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkStatus } from '@/lib/work-helpers'

interface Transition {
  to: WorkStatus
  label: string
  variant: 'primary' | 'danger' | 'success' | 'secondary'
}

interface Props {
  workId: string
  transitions: Transition[]
  /** Section 1 — client cascade lock. When true the status buttons are
   *  hidden and a small "Locked" pill shows the reason. The server route
   *  also rejects (409) so this is a UX hint, not a security boundary. */
  locked?: boolean
  /** The client status when `locked` is true — for the pill text. */
  clientStatus?: 'paused' | 'ended' | null
}

const colors: Record<Transition['variant'], string> = {
  primary: 'bg-lime-400 hover:bg-lime-300 text-black font-semibold',
  danger: 'bg-orange-600 hover:bg-orange-500 text-white',
  success: 'bg-green-600 hover:bg-green-500 text-white',
  secondary: 'bg-neutral-700 hover:bg-neutral-600 text-white',
}

export function StatusActionButtons({
  workId,
  transitions,
  locked = false,
  clientStatus = null,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleTransition(toStatus: WorkStatus) {
    setBusy(toStatus)
    setError(null)
    const res = await fetch(`/api/works/${workId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: toStatus }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error || 'Transition failed')
      setBusy(null)
      return
    }
    // Keep button disabled until the server re-render actually completes.
    startTransition(() => {
      router.refresh()
    })
    setBusy(null)
  }

  // Locked branch — short-circuit before rendering the button row.
  if (locked) {
    return (
      <div className="flex flex-col items-end gap-1">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950/40 border border-amber-800 px-3 py-1 text-xs text-amber-300">
          <Lock className="size-3" />
          Locked — client {clientStatus ?? 'paused/ended'}
        </span>
      </div>
    )
  }

  // Disable every button while ANY transition is in-flight OR the refresh
  // is still being applied — otherwise the user sees a flash of enabled
  // buttons before the new status renders.
  const disabled = busy !== null || isPending

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {transitions.map((t) => (
          <Button
            key={t.to}
            onClick={() => handleTransition(t.to)}
            disabled={disabled}
            className={colors[t.variant]}
            size="sm"
          >
            {busy === t.to || (isPending && busy === null) ? '…' : t.label}
          </Button>
        ))}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
