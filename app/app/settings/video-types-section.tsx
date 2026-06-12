'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface VideoType {
  id: string
  name: string
  display_order: number
}

interface Props {
  initialTypes: VideoType[]
}

export function VideoTypesSection({ initialTypes }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [types, setTypes] = useState<VideoType[]>(initialTypes)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  async function handleAdd() {
    if (!newName.trim()) return
    setAdding(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: m } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!m) throw new Error('No org')

      const nextOrder = types.length > 0
        ? Math.max(...types.map(t => t.display_order)) + 1
        : 0

      const { data, error: e } = await supabase
        .from('video_types')
        .insert({ org_id: m.org_id, name: newName.trim(), display_order: nextOrder, created_by: user!.id })
        .select('id, name, display_order')
        .single()
      if (e) throw e
      if (data) {
        setTypes(prev => [...prev, data].sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name)))
        setNewName('')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add'
      setError(msg.includes('unique') ? 'That type already exists' : msg)
    } finally {
      setAdding(false)
    }
  }

  async function handleRename(id: string) {
    if (!editName.trim()) { setEditingId(null); return }
    setSavingId(id)
    setError(null)
    try {
      const { error: e } = await supabase
        .from('video_types')
        .update({ name: editName.trim() })
        .eq('id', id)
      if (e) throw e
      setTypes(prev => prev.map(t => t.id === id ? { ...t, name: editName.trim() } : t))
      setEditingId(null)
      startTransition(() => {
        router.refresh()
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rename failed')
    } finally {
      setSavingId(null)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete video type "${name}"? Works that used this type will still show the name as text.`)) return
    setDeletingId(id)
    setError(null)
    try {
      const { error: e } = await supabase.from('video_types').delete().eq('id', id)
      if (e) throw e
      setTypes(prev => prev.filter(t => t.id !== id))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  function startEdit(type: VideoType) {
    setEditingId(type.id)
    setEditName(type.name)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-white mb-1">Video Types</h2>
      <p className="text-neutral-400 text-sm mb-4">
        Custom video types available in the Create Work form.
        Deleting a type does not affect existing works — the name is stored as text.
      </p>

      {error && (
        <div className="bg-red-950/40 border border-red-900 text-red-300 text-sm px-3 py-2 rounded mb-3">
          {error}
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg overflow-hidden mb-3">
        {types.length === 0 ? (
          <div className="px-4 py-6 text-center text-neutral-500 text-sm">
            No video types yet. Add one below.
          </div>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {types.map(t => (
              <li key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                {editingId === t.id ? (
                  <>
                    <Input
                      ref={inputRef}
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 h-7 text-sm bg-neutral-800 border-neutral-700"
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(t.id)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => handleRename(t.id)}
                      disabled={savingId === t.id || isPending}
                      className="h-7 bg-lime-400 text-black hover:bg-lime-300"
                    >
                      {savingId === t.id ? 'Saving…' : isPending ? 'Updating…' : 'Save'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      disabled={savingId === t.id || isPending}
                      className="h-7"
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-white">{t.name}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => startEdit(t)}
                      disabled={deletingId === t.id || isPending}
                      className="h-7 text-neutral-400 hover:text-white"
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(t.id, t.name)}
                      disabled={deletingId === t.id || isPending}
                      className="h-7 text-red-400 hover:text-red-300"
                    >
                      {deletingId === t.id ? 'Deleting…' : isPending ? 'Updating…' : 'Delete'}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="New type name (e.g. UGC, Marketing)"
          className="flex-1 bg-neutral-900 border-neutral-700"
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          disabled={adding || isPending}
        />
        <Button onClick={handleAdd} disabled={adding || isPending || !newName.trim()} className="bg-lime-400 text-black hover:bg-lime-300">
          {adding ? 'Adding…' : isPending ? 'Updating…' : '+ Add'}
        </Button>
      </div>
    </section>
  )
}
