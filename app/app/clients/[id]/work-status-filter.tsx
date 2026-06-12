'use client'

// Per-client Works section filter. Drives the `?wstatus=` URL param so the
// server component can re-render the works list filtered by status. Keeps
// the rest of the page's query (range, etc.) intact.

import { useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  WORK_STATUSES,
  WORK_STATUS_LABELS,
  type WorkStatus,
} from '@/lib/work-helpers'

interface Props {
  current: WorkStatus | 'all'
}

export function WorkStatusFilter({ current }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function handleChange(value: string) {
    const next = new URLSearchParams(params.toString())
    if (value === 'all') {
      next.delete('wstatus')
    } else {
      next.set('wstatus', value)
    }
    const qs = next.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
        Status
      </span>
      <Select
        value={current}
        onValueChange={(v) => handleChange(v as string)}
        disabled={isPending}
      >
        <SelectTrigger className="w-36 h-7 text-xs bg-neutral-900 border-neutral-700">
          <SelectValue>
            {(v) => {
              const val = v as WorkStatus | 'all' | null
              if (!val || val === 'all') return 'All works'
              return WORK_STATUS_LABELS[val]
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">
            All works
          </SelectItem>
          {WORK_STATUSES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {WORK_STATUS_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
