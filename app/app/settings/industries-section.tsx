'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface IndustryRow {
  id: string
  name: string
}

export function IndustriesSection({
  orgId,
  industries,
}: {
  orgId: string
  industries: IndustryRow[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  async function handleAdd() {
    if (!newName.trim()) return
    setBusy('add')
    setError(null)
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('industries').insert({
      org_id: orgId,
      name: newName.trim(),
      created_by: user?.id,
    })
    if (err) {
      setError(err.message.includes('duplicate') ? 'Already exists' : err.message)
    } else {
      setNewName('')
      setAdding(false)
      startTransition(() => {
        router.refresh()
      })
    }
    setBusy(null)
  }

  async function handleRename(id: string) {
    if (!editName.trim()) return
    setBusy(id)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('industries')
      .update({ name: editName.trim() })
      .eq('id', id)
    if (err) {
      setError(err.message.includes('duplicate') ? 'Already exists' : err.message)
    } else {
      setEditingId(null)
      setEditName('')
      startTransition(() => {
        router.refresh()
      })
    }
    setBusy(null)
  }

  async function handleDelete(id: string) {
    setBusy(id)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('industries').delete().eq('id', id)
    if (err) setError(err.message)
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <div>
      {industries.length === 0 ? (
        <div className="p-6 text-center text-neutral-500 text-sm">
          No industries added yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-800">
          {industries.map((ind) => (
            <div
              key={ind.id}
              className="px-4 py-3 flex items-center justify-between gap-4"
            >
              {editingId === ind.id ? (
                <div className="flex gap-2 flex-1">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="bg-neutral-900 border-neutral-700 text-white h-8 text-sm flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleRename(ind.id)
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleRename(ind.id)}
                    disabled={busy === ind.id || isPending}
                    className="h-8 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    {busy === ind.id ? 'Saving…' : isPending ? 'Updating…' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={busy === ind.id || isPending}
                    onClick={() => {
                      setEditingId(null)
                      setEditName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <span className="text-white text-sm">{ind.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={busy === ind.id || isPending}
                      onClick={() => {
                        setEditingId(ind.id)
                        setEditName(ind.name)
                      }}
                    >
                      Rename
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === ind.id || isPending}
                            className="h-8 text-red-400 border-red-900 hover:bg-red-950"
                          />
                        }
                      >
                        Delete
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-neutral-950 border-neutral-800">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="text-white">
                            Delete &ldquo;{ind.name}&rdquo;?
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-neutral-400">
                            Existing works using this industry will keep their
                            value. Future works won&apos;t see it in the dropdown.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(ind.id)}
                            className="bg-red-700 hover:bg-red-600 text-white"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="px-4 py-2 text-sm text-red-400 border-t border-neutral-800">
          {error}
        </div>
      )}

      {adding ? (
        <div className="px-4 py-3 border-t border-neutral-800 flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Food & Beverage"
            className="bg-neutral-900 border-neutral-700 text-white h-8 text-sm flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleAdd()
              }
            }}
            autoFocus
          />
          <Button
            size="sm"
            onClick={handleAdd}
            disabled={busy === 'add' || isPending}
            className="h-8 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {busy === 'add' ? 'Adding…' : isPending ? 'Updating…' : 'Add'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            disabled={busy === 'add' || isPending}
            onClick={() => {
              setAdding(false)
              setNewName('')
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-neutral-800">
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            disabled={isPending}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            + Add Industry
          </Button>
        </div>
      )}
    </div>
  )
}
