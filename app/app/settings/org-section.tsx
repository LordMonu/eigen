'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  orgId: string
  initialName: string
  initialDescription: string
}

export function OrgSection({ orgId, initialName, initialDescription }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [description, setDescription] = useState(initialDescription)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleSave() {
    if (!name.trim()) { setError('Name cannot be empty'); return }
    setSaving(true)
    setError(null)
    setSaved(false)
    const supabase = createClient()
    const { error: e } = await supabase
      .from('organizations')
      .update({ name: name.trim(), description: description.trim() || null })
      .eq('id', orgId)
    setSaving(false)
    if (e) {
      setError(e.message.includes('unique') ? 'That org name is already taken' : e.message)
    } else {
      setSaved(true)
      startTransition(() => {
        router.refresh()
      })
      setTimeout(() => setSaved(false), 3000)
    }
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-1">Organization</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Name shown in the sidebar header and in invitation flows.
      </p>
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 space-y-4">
        <div>
          <Label htmlFor="orgName" className="text-neutral-300 text-sm">Name</Label>
          <Input
            id="orgName"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1 bg-neutral-800 border-neutral-700 text-white"
          />
        </div>
        <div>
          <Label htmlFor="orgDesc" className="text-neutral-300 text-sm">Description <span className="text-neutral-500">(optional)</span></Label>
          <Input
            id="orgDesc"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Video production studio — Hyderabad"
            className="mt-1 bg-neutral-800 border-neutral-700 text-white"
          />
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <Button
          onClick={handleSave}
          disabled={saving || isPending}
          className="bg-lime-400 text-black hover:bg-lime-300"
        >
          {saving ? 'Saving…' : isPending ? 'Updating…' : saved ? '✓ Saved' : 'Save Changes'}
        </Button>
      </div>
    </section>
  )
}
