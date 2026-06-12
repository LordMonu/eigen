'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'

interface Props {
  membershipId: string
  orgName: string
  fullName: string
}

export function MemberSettings({ membershipId, orgName, fullName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleLeave() {
    setLeaving(true)
    try {
      const supabase = createClient()
      const { error: e } = await supabase.from('memberships').delete().eq('id', membershipId)
      if (e) { setError(e.message); return }
      await supabase.auth.signOut()
      startTransition(() => {
        router.push('/')
      })
    } finally {
      setLeaving(false)
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-400 text-sm mt-1">Your membership in {orgName}.</p>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-1">
        <div className="text-xs text-neutral-500 uppercase tracking-wider">Your name</div>
        <div className="text-white">{fullName}</div>
      </div>

      <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 space-y-3">
        <div>
          <div className="font-medium text-white text-sm">Leave Organization</div>
          <div className="text-neutral-400 text-xs mt-0.5">
            You will be removed from {orgName}. You can request to join again later.
          </div>
        </div>
        {!open ? (
          <Button variant="outline" disabled={leaving || isPending} className="border-red-900 text-red-400 hover:bg-red-950" onClick={() => setOpen(true)}>
            Leave {orgName}
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-neutral-300 text-sm">Are you sure? You will lose access immediately.</p>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button onClick={handleLeave} disabled={leaving || isPending} className="bg-red-700 hover:bg-red-600 text-white">
                {leaving ? 'Leaving…' : isPending ? 'Leaving…' : 'Leave'}
              </Button>
              <Button variant="ghost" disabled={leaving || isPending} onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
