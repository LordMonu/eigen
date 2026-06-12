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
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Member {
  user_id: string
  full_name: string
  role: string
}
interface VideoType {
  id: string
  name: string
}
interface WorkData {
  id: string
  title: string | null
  creator_id: string
  video_type: string | null
  max_credits: number | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  work: WorkData
}

// Get today's date in YYYY-MM-DD format (no past dates allowed)
function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function EditWorkDialog({ open, onOpenChange, work }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(work.title || '')
  // Multi-creator: first entry = primary (becomes works.creator_id).
  // Initialized from the work's primary; full list loaded from work_creators
  // when the dialog opens.
  const [creatorIds, setCreatorIds] = useState<string[]>([work.creator_id])
  const [videoType, setVideoType] = useState(work.video_type || '')
  const [addingVideoType, setAddingVideoType] = useState(false)
  const [newVideoTypeName, setNewVideoTypeName] = useState('')
  const [savingVideoType, setSavingVideoType] = useState(false)
  const [maxCredits, setMaxCredits] = useState(
    work.max_credits !== null ? String(work.max_credits) : ''
  )
  const [startDate, setStartDate] = useState(work.start_date || '')
  const [endDate, setEndDate] = useState(work.end_date || '')
  const [startTime, setStartTime] = useState(work.start_time || '')
  const [endTime, setEndTime] = useState(work.end_time || '')
  const [notes, setNotes] = useState(work.notes || '')

  const [members, setMembers] = useState<Member[]>([])
  const [videoTypes, setVideoTypes] = useState<VideoType[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [{ data: m }, { data: vt }, { data: wc }] = await Promise.all([
        supabase
          .from('memberships')
          .select('user_id, full_name, role')
          .eq('status', 'active'),
        supabase.from('video_types').select('id, name').order('name'),
        supabase
          .from('work_creators')
          .select('user_id, added_at')
          .eq('work_id', work.id)
          .order('added_at', { ascending: true }),
      ])
      if (cancelled) return
      setMembers(m || [])
      setVideoTypes(vt || [])
      // Hydrate creatorIds from work_creators; ensure the primary
      // creator_id is the first entry so the UI shows the "primary" pill on
      // the right person.
      const fromJoin = (wc || []).map((row) => row.user_id as string)
      const primary = work.creator_id
      const ordered =
        fromJoin.length > 0
          ? [primary, ...fromJoin.filter((id) => id !== primary)]
          : [primary]
      setCreatorIds(ordered)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [open, work.id, work.creator_id])

  async function handleAddVideoType() {
    if (!newVideoTypeName.trim() || savingVideoType) return
    setSavingVideoType(true)
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

      const { data, error } = await supabase
        .from('video_types')
        .insert({
          org_id: membership.org_id,
          name: newVideoTypeName.trim(),
          created_by: user.id,
        })
        .select('id, name')
        .single()

      if (error) {
        setError(error.message.includes('duplicate') ? 'Type already exists' : error.message)
        return
      }
      if (data) {
        setVideoTypes((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setVideoType(data.name)
        setAddingVideoType(false)
        setNewVideoTypeName('')
        setError(null)
      }
    } finally {
      setSavingVideoType(false)
    }
  }

  async function handleSave() {
    if (creatorIds.length === 0) {
      setError('Pick at least one creator')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/works/${work.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim() || null,
          // creator_ids is the new multi-field. The API also accepts the
          // legacy creator_id for compat — we send the first picked as
          // primary so existing fast paths keep working.
          creator_id: creatorIds[0],
          creator_ids: creatorIds,
          video_type: videoType || null,
          max_credits: maxCredits ? parseFloat(maxCredits) : null,
          start_date: startDate || null,
          end_date: endDate || null,
          start_time: startTime || null,
          end_time: endTime || null,
          notes: notes.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Update failed')
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-950 border-neutral-800 text-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Work</DialogTitle>
          <DialogDescription className="text-neutral-400">
            Update work details. Changes save immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-neutral-300">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>

          <div>
            <Label className="text-neutral-300 flex items-center justify-between">
              <span>Creators</span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                {creatorIds.length} of {members.length} picked
              </span>
            </Label>
            <p className="text-[11px] text-neutral-500 mt-1 mb-2">
              Anyone in this list can submit the work for review.
              First picked is the primary contact.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-900/40 p-1.5">
              {members.length === 0 ? (
                <p className="text-xs text-neutral-500 px-2 py-3 text-center">
                  Loading members…
                </p>
              ) : (
                members.map((m) => {
                  const checked = creatorIds.includes(m.user_id)
                  const isPrimary = creatorIds[0] === m.user_id
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => {
                        setCreatorIds((prev) =>
                          prev.includes(m.user_id)
                            ? prev.filter((id) => id !== m.user_id)
                            : [...prev, m.user_id],
                        )
                      }}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors text-left ${
                        checked
                          ? 'border-lime-800 bg-lime-950/30'
                          : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate flex items-center gap-2">
                          {m.full_name}
                          {isPrimary && (
                            <span className="text-[10px] text-lime-400 uppercase tracking-wider">
                              primary
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-neutral-500 capitalize">
                          {m.role}
                        </div>
                      </div>
                      <div
                        className={`size-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          checked
                            ? 'border-lime-400 bg-lime-400'
                            : 'border-neutral-600 bg-transparent'
                        }`}
                      >
                        {checked && (
                          <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            className="size-3 text-black"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.704 5.295a1 1 0 0 1 .001 1.414l-7.071 7.092a1 1 0 0 1-1.415 0L4.293 10.875a1 1 0 0 1 1.414-1.414l3.225 3.232 6.36-6.398a1 1 0 0 1 1.412 0Z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div>
            <div>
              <Label className="text-neutral-300">Video Type</Label>
              {!addingVideoType ? (
                <Select value={videoType} onValueChange={(v) => {
                  const val = v as string
                  if (val === '__add') setAddingVideoType(true)
                  else setVideoType(val)
                }}>
                  <SelectTrigger className="mt-1 bg-neutral-900 border-neutral-700">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videoTypes.map((vt) => (
                      <SelectItem key={vt.id} value={vt.name}>
                        {vt.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="__add" className="text-lime-400">
                      + Add new type
                    </SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newVideoTypeName}
                    onChange={(e) => setNewVideoTypeName(e.target.value)}
                    placeholder="e.g. Reel, Story"
                    className="bg-neutral-900 border-neutral-700 text-white flex-1"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddVideoType()
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddVideoType}
                    disabled={savingVideoType || !newVideoTypeName.trim()}
                    className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                  >
                    {savingVideoType ? 'Adding…' : 'Add'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={savingVideoType}
                    onClick={() => {
                      setAddingVideoType(false)
                      setNewVideoTypeName('')
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div>
            <Label className="text-neutral-300">Max Credits</Label>
            <Input
              type="number"
              step="0.1"
              value={maxCredits}
              onChange={(e) => setMaxCredits(e.target.value)}
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">Start Date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={getTodayDateString()}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
            <div>
              <Label className="text-neutral-300">End Date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={getTodayDateString()}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-neutral-300">Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
            <div>
              <Label className="text-neutral-300">End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              />
            </div>
          </div>

          <div>
            <Label className="text-neutral-300">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm"
            />
          </div>

          {error && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting || isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={submitting || isPending}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting
              ? 'Saving…'
              : isPending
                ? 'Updating…'
                : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
