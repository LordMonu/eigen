'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { DateRange } from 'react-day-picker'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
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

// YYYY-MM-DD in local time (avoids UTC off-by-one near midnight).
function toIsoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Get today's date in YYYY-MM-DD format (no past dates allowed)
function getTodayDateString(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

interface Member {
  user_id: string
  full_name: string
  role: string
}
interface VideoType {
  id: string
  name: string
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  /** Pre-fill the schedule range to a single day (YYYY-MM-DD). */
  initialDate?: string
}

export function CreateWorkDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  initialDate,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-neutral-950 border-neutral-800 text-white p-0
                   w-[min(90vw,72rem)] sm:max-w-[min(90vw,72rem)]
                   h-[90vh] grid-rows-[auto_1fr_auto] gap-0"
      >
        {/* Fresh mount each open → fields reset via useState defaults (no effect). */}
        {open && (
          <WorkForm
            clientId={clientId}
            clientName={clientName}
            initialDate={initialDate}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function WorkForm({
  clientId,
  clientName,
  initialDate,
  onOpenChange,
}: {
  clientId: string
  clientName: string
  initialDate?: string
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1: schedule (all optional)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    if (!initialDate) return undefined
    const [y, m, d] = initialDate.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return { from: dt, to: dt }
  })
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  // Step 2: basic info
  const [members, setMembers] = useState<Member[]>([])
  // Multi-creator: a work can be co-owned by multiple members. The first
  // entry in this set becomes the "primary" creator_id on the works row;
  // every entry (including that one) gets a row in work_creators.
  const [creatorIds, setCreatorIds] = useState<string[]>([])
  const [videoTypes, setVideoTypes] = useState<VideoType[]>([])
  const [videoType, setVideoType] = useState('')
  const [addingType, setAddingType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [savingType, setSavingType] = useState(false)
  const [maxCredits, setMaxCredits] = useState('')
  const [title, setTitle] = useState('')

  // Step 3: instructions — file upload OR inline text (or both).
  const [instructionsFile, setInstructionsFile] = useState<File | null>(null)
  const [instructionsText, setInstructionsText] = useState('')

  // Load org members + video types on mount (state set after await — allowed).
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const [{ data: m }, { data: vt }] = await Promise.all([
        supabase
          .from('memberships')
          .select('user_id, full_name, role')
          .eq('status', 'active'),
        supabase.from('video_types').select('id, name').order('name'),
      ])
      if (!cancelled) {
        setMembers(m || [])
        setVideoTypes(vt || [])
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleAddType() {
    if (!newTypeName.trim() || savingType) return
    setSavingType(true)
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
          name: newTypeName.trim(),
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
        setAddingType(false)
        setNewTypeName('')
        setError(null)
      }
    } finally {
      setSavingType(false)
    }
  }

  async function handleSubmit() {
    if (creatorIds.length === 0) {
      setError('Pick at least one creator')
      setStep(2)
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

      // Generate work ID client-side so storage path can use it before insert.
      const workId = crypto.randomUUID()

      // Instructions: file (if any) → instructions_path; text (if any) → notes.
      // Both fields are independent; the user can supply one, the other, or both.
      let instructionsPath: string | null = null
      if (instructionsFile) {
        const filename = `instructions${instructionsFile.name.endsWith('.md') ? '.md' : '.txt'}`
        instructionsPath = `${membership.org_id}/${workId}/${filename}`
        const { error: uploadError } = await supabase.storage
          .from('work-instructions')
          .upload(instructionsPath, instructionsFile)
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // creator_id stays as the "primary" creator — the head of the
      // creators list. Every picked creator (including this one) also lands
      // in work_creators so co-ownership is the source of truth.
      const primaryCreatorId = creatorIds[0]

      const { error: insertError } = await supabase.from('works').insert({
        id: workId,
        org_id: membership.org_id,
        client_id: clientId,
        creator_id: primaryCreatorId,
        title: title.trim() || null,
        video_type: videoType || null,
        max_credits: maxCredits ? parseFloat(maxCredits) : null,
        instructions_path: instructionsPath,
        notes: instructionsText.trim() || null,
        start_date: dateRange?.from ? toIsoDate(dateRange.from) : null,
        end_date: dateRange?.to ? toIsoDate(dateRange.to) : null,
        start_time: startTime || null,
        end_time: endTime || null,
        status: 'ongoing',
        created_by: user.id,
      })

      if (insertError) {
        console.error('[create-work] insert failed:', insertError)
        throw new Error(
          `${insertError.message}${insertError.hint ? ` — ${insertError.hint}` : ''}`
        )
      }

      // Co-owners go into the work_creators join table.
      const creatorRows = creatorIds.map((uid) => ({
        work_id: workId,
        user_id: uid,
        added_by: user.id,
      }))
      const { error: wcErr } = await supabase
        .from('work_creators')
        .insert(creatorRows)

      // If only the join-table insert failed, the work still exists with the
      // primary creator_id intact — so we'd rather forward the user to the
      // detail page than block. Surface the partial failure as a non-fatal
      // warning in the dialog before navigating so the master knows to use
      // Edit Work to retry the co-owners.
      if (wcErr) {
        console.error('[create-work] work_creators insert failed:', wcErr)
        setError(
          `Work created, but co-owner setup failed (${wcErr.message}). ` +
            `Open the work and use Edit to add ${
              creatorIds.length - 1
            } co-owner${creatorIds.length - 1 === 1 ? '' : 's'} manually.`,
        )
        // Don't redirect — let the user read the message and decide.
        return
      }

      onOpenChange(false)
      startTransition(() => {
        router.refresh()
        router.push(`/app/works/${workId}`)
      })
    } catch (err) {
      console.error('[create-work] error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-800">
        <DialogTitle>Create Work for {clientName}</DialogTitle>
        <DialogDescription className="text-neutral-400">
          Step {step} of 3
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-4 overflow-y-auto min-h-0">

      {/* STEPPER */}
      <div className="flex items-center gap-2 mb-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                s === step
                  ? 'bg-lime-400 text-black'
                  : s < step
                    ? 'bg-lime-900 text-lime-300'
                    : 'bg-neutral-800 text-neutral-500'
              }`}
            >
              {s}
            </div>
            <div className="ml-2 text-xs text-neutral-400">
              {s === 1 ? 'Schedule' : s === 2 ? 'Basic Info' : 'Instructions'}
            </div>
            {s < 3 && (
              <div
                className={`flex-1 h-px mx-2 ${s < step ? 'bg-lime-900' : 'bg-neutral-800'}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* STEP 1: SCHEDULE */}
      {step === 1 && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-neutral-400">
            All fields optional — skip if not relevant. Pick a start day, then an
            end day to define the range.
          </p>

          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3 flex justify-center">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={dateRange}
                onSelect={setDateRange}
                showOutsideDays={false}
                className="
                  [--cell-size:--spacing(12)]
                  text-base
                  [&_.rdp-weekday]:text-xs
                  [&_.rdp-month_caption]:text-base
                  [&_.rdp-month_caption]:font-semibold

                  [&_[data-range-start=true]]:bg-lime-400
                  [&_[data-range-start=true]]:text-black
                  [&_[data-range-end=true]]:bg-lime-400
                  [&_[data-range-end=true]]:text-black
                  [&_[data-range-middle=true]]:bg-lime-900/40
                  [&_[data-range-middle=true]]:text-lime-200
                  [&_[data-selected-single=true]]:bg-lime-400
                  [&_[data-selected-single=true]]:text-black
                "
              />
            </div>

            <div className="lg:w-56 space-y-4 shrink-0">
              <div>
                <Label className="text-neutral-300 text-xs">Start time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 bg-neutral-900 border-neutral-700 text-white"
                />
              </div>
              <div>
                <Label className="text-neutral-300 text-xs">End time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 bg-neutral-900 border-neutral-700 text-white"
                />
              </div>
              <p className="text-xs text-neutral-500 col-span-2 mt-1">
                📅 Start and end dates cannot be in the past
              </p>

              <div className="pt-2 border-t border-neutral-800 text-xs text-neutral-500 space-y-1">
                <div>
                  <span className="text-neutral-400">Start:</span>{' '}
                  {dateRange?.from
                    ? dateRange.from.toLocaleDateString('en-US')
                    : '—'}
                </div>
                <div>
                  <span className="text-neutral-400">End:</span>{' '}
                  {dateRange?.to ? dateRange.to.toLocaleDateString('en-US') : '—'}
                </div>
                {dateRange && (
                  <button
                    type="button"
                    onClick={() => setDateRange(undefined)}
                    className="text-lime-400 hover:underline mt-1"
                  >
                    Clear range
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: BASIC INFO */}
      {step === 2 && (
        <div className="space-y-4 py-2">
          <div>
            <Label className="text-neutral-300">Title (optional)</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q3 UGC Reel Series"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
          </div>
          <div>
            <Label className="text-neutral-300 flex items-center justify-between">
              <span>Creators *</span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                {creatorIds.length} of {members.length} picked
              </span>
            </Label>
            <p className="text-[11px] text-neutral-500 mt-1 mb-2">
              Pick one or more — they&apos;ll all be able to submit this work
              for review. The first picked is the primary contact.
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-900/40 p-1.5">
              {members.length === 0 ? (
                <p className="text-xs text-neutral-500 px-2 py-3 text-center">
                  No active members yet.
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
            <Label className="text-neutral-300">Video Type (optional)</Label>
            {!addingType ? (
              <div className="flex gap-2 mt-1">
                <Select
                  value={videoType}
                  onValueChange={(v) => {
                    const val = v as string
                    if (val === '__add') setAddingType(true)
                    else setVideoType(val)
                  }}
                >
                  <SelectTrigger className="bg-neutral-900 border-neutral-700 flex-1">
                    <SelectValue placeholder="Pick or add..." />
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
              </div>
            ) : (
              <div className="flex gap-2 mt-1">
                <Input
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder="e.g. UGC, Marketing, Reel"
                  className="bg-neutral-900 border-neutral-700 text-white flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddType()
                    }
                  }}
                />
                <Button
                  size="sm"
                  onClick={handleAddType}
                  disabled={savingType || isPending || !newTypeName.trim()}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                >
                  {savingType ? 'Adding…' : isPending ? 'Updating…' : 'Add'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingType || isPending}
                  onClick={() => {
                    setAddingType(false)
                    setNewTypeName('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          <div>
            <Label className="text-neutral-300">Max credits (optional)</Label>
            <Input
              type="number"
              step="0.1"
              value={maxCredits}
              onChange={(e) => setMaxCredits(e.target.value)}
              placeholder="e.g. 200"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Soft limit. Useful for budget tracking; not enforced.
            </p>
          </div>
        </div>
      )}

      {/* STEP 3: INSTRUCTIONS */}
      {step === 3 && (
        <div className="space-y-4 py-2">
          <p className="text-sm text-neutral-400">
            Add a creative brief, references, or any notes for the creator.
            You can upload a .md / .txt file AND type inline notes — both
            will be saved together.
          </p>

          <div>
            <Label className="text-neutral-300">Instructions file (optional)</Label>
            <Input
              type="file"
              accept=".md,.txt"
              onChange={(e) => setInstructionsFile(e.target.files?.[0] || null)}
              className="mt-1 bg-neutral-900 border-neutral-700 text-white file:text-neutral-300 file:bg-neutral-700 file:border-0 file:rounded file:px-3 file:py-1 file:mr-3"
              disabled={submitting || isPending}
            />
            {instructionsFile && (
              <p className="text-xs text-neutral-400 mt-2">
                Selected: {instructionsFile.name} (
                {(instructionsFile.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>

          <div>
            <Label className="text-neutral-300">Notes (optional)</Label>
            <textarea
              value={instructionsText}
              onChange={(e) => setInstructionsText(e.target.value)}
              placeholder="Brief, references, style guidelines…"
              rows={6}
              disabled={submitting || isPending}
              className="mt-1 w-full rounded-md bg-neutral-900 border border-neutral-700 text-white px-3 py-2 text-sm font-mono disabled:opacity-50"
            />
            <p className="text-xs text-neutral-500 mt-1">
              Saved as notes on the work. Independent of the uploaded file.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm mt-4">
          {error}
        </div>
      )}

      </div>

      {/* FOOTER NAVIGATION */}
      <div className="flex justify-between gap-3 px-6 py-4 border-t border-neutral-800">
        <Button
          variant="outline"
          onClick={() => (step > 1 ? setStep(step - 1) : onOpenChange(false))}
          disabled={submitting || isPending}
        >
          {step === 1 ? 'Cancel' : 'Back'}
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => {
              if (step === 2 && creatorIds.length === 0) {
                setError('Pick at least one creator')
                return
              }
              setError(null)
              setStep(step + 1)
            }}
            disabled={submitting || isPending}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            Next
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={submitting || isPending}
            className="bg-green-600 hover:bg-green-500 text-white"
          >
            {submitting ? 'Creating…' : isPending ? 'Updating…' : 'Create Work'}
          </Button>
        )}
      </div>
    </>
  )
}
