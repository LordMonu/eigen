'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface ClientData {
  id: string
  name: string
  industry: string | null
  status: ClientStatus
}

interface Industry {
  id: string
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  initialData?: ClientData
}

export function ClientFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
        {/* Mount fresh each time it opens so fields populate/reset from props. */}
        {open && (
          <ClientForm
            key={`${mode}:${initialData?.id ?? 'new'}`}
            mode={mode}
            initialData={initialData}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function ClientForm({
  mode,
  initialData,
  onOpenChange,
}: {
  mode: 'create' | 'edit'
  initialData?: ClientData
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const editing = mode === 'edit' && initialData
  const [name, setName] = useState(editing ? initialData.name : '')
  const [industry, setIndustry] = useState(
    editing ? initialData.industry || '' : ''
  )
  const [status, setStatus] = useState<ClientStatus>(
    editing ? initialData.status : 'outreach'
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Industry dropdown state
  const [industries, setIndustries] = useState<Industry[]>([])
  const [addingIndustry, setAddingIndustry] = useState(false)
  const [newIndustryName, setNewIndustryName] = useState('')
  const [savingIndustry, setSavingIndustry] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('industries')
        .select('id, name')
        .order('name')
      if (!cancelled) setIndustries(data || [])
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAddIndustry() {
    if (!newIndustryName.trim() || savingIndustry) return
    setSavingIndustry(true)
    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: membership } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!membership) return

      const { data, error: err } = await supabase
        .from('industries')
        .insert({
          org_id: membership.org_id,
          name: newIndustryName.trim(),
          created_by: user.id,
        })
        .select('id, name')
        .single()

      if (err) {
        setError(
          err.message.includes('duplicate')
            ? 'Industry already exists'
            : err.message
        )
        return
      }
      if (data) {
        setIndustries((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setIndustry(data.name)
        setAddingIndustry(false)
        setNewIndustryName('')
        setError(null)
      }
    } finally {
      setSavingIndustry(false)
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required')
      return
    }
    setSubmitting(true)
    setError(null)

    try {
      const supabase = createClient()

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: membership } = await supabase
        .from('memberships')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (!membership) throw new Error('No active organization')

      if (mode === 'create') {
        const { data: inserted, error: insertError } = await supabase.from('clients').insert({
          org_id: membership.org_id,
          name: name.trim(),
          industry: industry.trim() || null,
          status,
        }).select('id').maybeSingle()
        if (insertError) {
          if (
            insertError.message.includes('duplicate') ||
            insertError.message.includes('unique')
          ) {
            throw new Error(
              'A client with that name already exists in your organization'
            )
          }
          throw insertError
        }
        if (inserted?.id) {
          fetch('/api/activity-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityType: 'client', entityId: inserted.id, action: 'created', toValue: name.trim() }),
          }).catch(() => {})
        }
      } else if (mode === 'edit' && initialData) {
        const { error: updateError } = await supabase
          .from('clients')
          .update({
            name: name.trim(),
            industry: industry.trim() || null,
            status,
          })
          .eq('id', initialData.id)
        if (updateError) throw updateError
        fetch('/api/activity-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityType: 'client', entityId: initialData.id, action: 'edited', toValue: name.trim() }),
        }).catch(() => {})
      }

      onOpenChange(false)
      startTransition(() => {
        router.refresh()
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {mode === 'create' ? 'Create New Client' : 'Edit Client'}
        </DialogTitle>
        <DialogDescription className="text-neutral-400">
          {mode === 'create'
            ? 'Add a client to your pipeline. You can change details later.'
            : 'Update client details.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div>
          <Label htmlFor="name" className="text-neutral-300">
            Name *
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cream Centre"
            className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            disabled={submitting || isPending}
          />
        </div>

        <div>
          <Label className="text-neutral-300">Industry</Label>
          {!addingIndustry ? (
            <Select
              value={industry}
              onValueChange={(v) => {
                const val = v as string
                if (val === '__add_industry') setAddingIndustry(true)
                else setIndustry(val)
              }}
              disabled={submitting || isPending}
            >
              <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                <SelectValue placeholder="Pick or add an industry..." />
              </SelectTrigger>
              <SelectContent>
                {industries.map((ind) => (
                  <SelectItem key={ind.id} value={ind.name}>
                    {ind.name}
                  </SelectItem>
                ))}
                <SelectItem
                  value="__add_industry"
                  className="text-lime-400"
                >
                  + Add new industry
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="flex gap-2 mt-1">
              <Input
                value={newIndustryName}
                onChange={(e) => setNewIndustryName(e.target.value)}
                placeholder="e.g. Food & Beverage"
                className="bg-neutral-900 border-neutral-700 text-white flex-1"
                disabled={savingIndustry || isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddIndustry()
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleAddIndustry}
                disabled={savingIndustry || isPending || !newIndustryName.trim()}
                className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
              >
                {savingIndustry ? 'Adding…' : isPending ? 'Updating…' : 'Add'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={savingIndustry || isPending}
                onClick={() => {
                  setAddingIndustry(false)
                  setNewIndustryName('')
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        <div>
          <Label className="text-neutral-300">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as ClientStatus)}
            disabled={submitting || isPending}
          >
            <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
              <SelectValue>
                {(v) => {
                  const val = v as ClientStatus | null
                  return val ? CLIENT_STATUS_LABELS[val] : 'Pick a status'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CLIENT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {CLIENT_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
          {error}
        </div>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting || isPending}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={submitting || isPending}
          className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
        >
          {submitting
            ? 'Saving…'
            : isPending
              ? 'Updating…'
              : mode === 'create'
                ? 'Create Client'
                : 'Save Changes'}
        </Button>
      </DialogFooter>
    </>
  )
}
