'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  orgId: string
  orgName: string
}

export function DangerSection({ orgId, orgName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleDelete() {
    if (confirmName !== orgName) { setError('Name does not match'); return }
    setDeleting(true)
    setError(null)
    const supabase = createClient()
    const { error: e } = await supabase.from('organizations').delete().eq('id', orgId)
    if (e) { setError(e.message); setDeleting(false); return }
    await supabase.auth.signOut()
    startTransition(() => {
      router.push('/')
    })
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-red-400 mb-1">Danger Zone</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Destructive actions. Irreversible.
      </p>

      <div className="bg-red-950/30 border border-red-900 rounded-lg p-4 space-y-3">
        <div>
          <div className="font-medium text-white text-sm">Delete Organization</div>
          <div className="text-neutral-400 text-xs mt-0.5">
            Permanently deletes the org, all clients, all works, all members.
            Generations are anonymised (client/work ID set to null).
            This action cannot be undone.
          </div>
        </div>

        {!open ? (
          <Button
            variant="outline"
            className="border-red-900 text-red-400 hover:bg-red-950"
            onClick={() => setOpen(true)}
            disabled={deleting || isPending}
          >
            Delete Organization
          </Button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300">
              Type <span className="font-mono text-red-300">{orgName}</span> to confirm:
            </p>
            <Input
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              placeholder={orgName}
              className="bg-neutral-800 border-neutral-700 text-white"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2">
              <Button
                onClick={handleDelete}
                disabled={deleting || isPending || confirmName !== orgName}
                className="bg-red-700 hover:bg-red-600 text-white"
              >
                {deleting ? 'Deleting…' : isPending ? 'Updating…' : 'Permanently Delete'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setOpen(false); setConfirmName(''); setError(null) }}
                disabled={deleting || isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
