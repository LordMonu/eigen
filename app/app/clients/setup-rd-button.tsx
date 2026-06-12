'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export function SetupRdButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSetup() {
    setBusy(true)
    const res = await fetch('/api/clients/setup-rd', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok && data.id) {
      startTransition(() => {
        router.push(`/app/clients/${data.id}`)
      })
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSetup}
      disabled={busy || isPending}
      className="text-neutral-400 border-neutral-700 hover:bg-neutral-900 text-xs"
    >
      {busy || isPending ? 'Setting up…' : '+ R&D Client'}
    </Button>
  )
}
