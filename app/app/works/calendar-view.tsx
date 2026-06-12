'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X, Plus, Lock, ArrowRight, ArrowLeft } from 'lucide-react'
import { WORK_STATUS_COLORS, type WorkStatus } from '@/lib/work-helpers'
import { CreateWorkDialog } from './create-work-dialog'
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
import { Button } from '@/components/ui/button'

interface WorkItem {
  id: string
  title: string
  clientName: string
  status: WorkStatus
  startDate: string | null // YYYY-MM-DD
  endDate: string | null // YYYY-MM-DD
  /** Section 1 — true when the work's client is paused/ended. Drives the
   *  small Lock icon on the chip + the "Locked" tag in the day modal. */
  isLocked?: boolean
  /** The client's actual status — for the tooltip on the lock icon. */
  clientStatus?: string | null
}

export interface CalendarClient {
  id: string
  name: string
  canCreateWork: boolean
}

interface Props {
  works: WorkItem[]
  clients: CalendarClient[]
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function shiftDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarView({ works, clients }: Props) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // "+" flow: pick client → open create-work dialog with that client + date.
  const [pickerDate, setPickerDate] = useState<string | null>(null)
  const [pickerClientId, setPickerClientId] = useState<string>('')
  const [creating, setCreating] = useState<{
    clientId: string
    clientName: string
    date: string
  } | null>(null)

  const eligibleClients = useMemo(
    () => clients.filter((c) => c.canCreateWork),
    [clients],
  )

  function prevMonth() {
    if (month === 0) {
      setMonth(11)
      setYear(year - 1)
    } else {
      setMonth(month - 1)
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0)
      setYear(year + 1)
    } else {
      setMonth(month + 1)
    }
  }

  function goToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
  }

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfWeek(year, month)

  // Build per-date work list. Work order is stable: works.forEach iterates in
  // a fixed order, so each work lands at the same index on every date it
  // touches — which keeps multi-day bars visually aligned across columns.
  const worksByDate = new Map<string, WorkItem[]>()
  const noDeadline: WorkItem[] = []

  works.forEach((w) => {
    if (!w.endDate) {
      noDeadline.push(w)
      return
    }
    const start = w.startDate ? new Date(w.startDate) : new Date(w.endDate)
    const end = new Date(w.endDate)
    const current = new Date(start)
    while (current <= end) {
      const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
      const existing = worksByDate.get(dateStr) || []
      if (!existing.includes(w)) {
        existing.push(w)
        worksByDate.set(dateStr, existing)
      }
      current.setDate(current.getDate() + 1)
    }
  })

  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  function handlePlusClick(dateStr: string) {
    setPickerClientId('')
    setPickerDate(dateStr)
  }

  function confirmPicker() {
    const client = eligibleClients.find((c) => c.id === pickerClientId)
    if (!client || !pickerDate) return
    const date = pickerDate
    setPickerDate(null)
    setCreating({ clientId: client.id, clientName: client.name, date })
  }

  return (
    <div className="space-y-4">
      {/* MONTH NAV */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronLeft className="size-5" />
          </button>
          <h2 className="text-lg font-semibold text-white min-w-[180px] text-center">
            {MONTH_NAMES[month]} {year}
          </h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
        <button
          onClick={goToday}
          className="text-xs text-lime-400 hover:underline"
        >
          Today
        </button>
      </div>

      {/* DAY HEADERS */}
      <div className="grid grid-cols-7 gap-px bg-neutral-800 rounded-lg overflow-hidden">
        {DAY_NAMES.map((d) => (
          <div
            key={d}
            className="bg-neutral-900 px-2 py-2 text-center text-xs text-neutral-500 font-medium"
          >
            {d}
          </div>
        ))}

        {/* DAY CELLS */}
        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`empty-${i}`} className="bg-neutral-950 min-h-[100px]" />
          }
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayWorks = worksByDate.get(dateStr) || []
          const isToday = dateStr === todayStr
          const colInWeek = i % 7 // 0=Sun … 6=Sat

          return (
            <div
              key={dateStr}
              className={`group relative bg-neutral-950 min-h-[100px] p-1.5 ${
                isToday ? 'ring-1 ring-inset ring-lime-400/50' : ''
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div
                  className={`text-xs ${
                    isToday
                      ? 'text-lime-400 font-bold'
                      : 'text-neutral-500'
                  }`}
                >
                  {day}
                </div>
                {eligibleClients.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handlePlusClick(dateStr)}
                    title="Create work on this day"
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-lime-400"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              <div className="space-y-0.5">
                {dayWorks.slice(0, 3).map((w) => {
                  const prevDate = shiftDate(dateStr, -1)
                  const nextDate = shiftDate(dateStr, +1)
                  const prevHas =
                    colInWeek > 0 &&
                    (worksByDate.get(prevDate)?.includes(w) ?? false)
                  const nextHas =
                    colInWeek < 6 &&
                    (worksByDate.get(nextDate)?.includes(w) ?? false)

                  // Negative margins + flat sides bridge the 1px column gap so
                  // a multi-day span reads as one continuous bar.
                  const continuity = [
                    prevHas ? '-ml-[5px] rounded-l-none border-l-0' : '',
                    nextHas ? '-mr-[5px] rounded-r-none border-r-0' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  return (
                    <Link
                      key={w.id}
                      href={`/app/works/${w.id}`}
                      className={`flex items-center gap-1 text-[10px] leading-tight px-1 py-0.5 rounded truncate border ${WORK_STATUS_COLORS[w.status]} hover:opacity-80 transition-opacity ${continuity}`}
                      title={
                        w.isLocked
                          ? `Locked — client ${w.clientStatus ?? 'paused/ended'}`
                          : undefined
                      }
                    >
                      {prevHas && (
                        <ArrowLeft className="size-2 shrink-0 text-current opacity-60" />
                      )}
                      {prevHas ? (
                        <span className="truncate">{' '}</span>
                      ) : (
                        <>
                          {w.isLocked && (
                            <Lock className="size-2.5 shrink-0 text-amber-300" />
                          )}
                          <span className="truncate">
                            {w.title || 'Untitled'}
                          </span>
                        </>
                      )}
                      {nextHas && (
                        <ArrowRight className="size-2 shrink-0 text-current opacity-60 ml-auto" />
                      )}
                    </Link>
                  )
                })}
                {dayWorks.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    className="text-[10px] text-lime-400 hover:text-lime-300 px-1 cursor-pointer transition-colors"
                  >
                    +{dayWorks.length - 3} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* NO DEADLINE ROW */}
      {noDeadline.length > 0 && (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-500 mb-2">
            No deadline ({noDeadline.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {noDeadline.map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className={`inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border ${WORK_STATUS_COLORS[w.status]} hover:opacity-80 transition-opacity`}
                title={
                  w.isLocked
                    ? `Locked — client ${w.clientStatus ?? 'paused/ended'}`
                    : undefined
                }
              >
                {w.isLocked && (
                  <Lock className="size-3 shrink-0 text-amber-300" />
                )}
                <span>{w.title || 'Untitled'} · {w.clientName}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ALL WORKS FOR SELECTED DATE */}
      {selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between sticky top-0 bg-neutral-950 border-b border-neutral-800 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Works on {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {(worksByDate.get(selectedDate) || []).length} work
                  {(worksByDate.get(selectedDate) || []).length === 1 ? '' : 's'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDate(null)}
                className="p-1 hover:bg-neutral-800 rounded transition-colors"
              >
                <X className="size-5 text-neutral-400 hover:text-white" />
              </button>
            </div>
            <div className="divide-y divide-neutral-800 p-3 space-y-1">
              {(worksByDate.get(selectedDate) || []).map((w) => (
                <Link
                  key={w.id}
                  href={`/app/works/${w.id}`}
                  className="block p-3 hover:bg-neutral-900/50 rounded transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white group-hover:text-lime-400 transition-colors truncate">
                        {w.title || 'Untitled'}
                      </div>
                      <div className="text-sm text-neutral-400 mt-1">
                        {w.clientName}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded border shrink-0 ${WORK_STATUS_COLORS[w.status]}`}
                    >
                      {w.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CLIENT PICKER for "+" on a date */}
      <Dialog
        open={pickerDate !== null}
        onOpenChange={(o) => {
          if (!o) setPickerDate(null)
        }}
      >
        <DialogContent className="bg-neutral-950 border-neutral-800 text-white">
          <DialogHeader>
            <DialogTitle>Create work</DialogTitle>
            <DialogDescription className="text-neutral-400">
              {pickerDate
                ? new Date(pickerDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })
                : ''}
              {' — pick a client to continue.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select
              value={pickerClientId}
              onValueChange={(v) => setPickerClientId(v as string)}
            >
              <SelectTrigger className="bg-neutral-900 border-neutral-700 w-full">
                <SelectValue placeholder="Pick a client…">
                  {(v) => {
                    const id = v as string | null
                    const c = id
                      ? eligibleClients.find((c) => c.id === id)
                      : null
                    return c ? c.name : 'Pick a client…'
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {eligibleClients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-neutral-500">
              Only clients with status Ongoing, Trial, or In Talks can have
              new works.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPickerDate(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmPicker}
              disabled={!pickerClientId}
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {creating && (
        <CreateWorkDialog
          open={true}
          onOpenChange={(o) => {
            if (!o) setCreating(null)
          }}
          clientId={creating.clientId}
          clientName={creating.clientName}
          initialDate={creating.date}
        />
      )}
    </div>
  )
}
