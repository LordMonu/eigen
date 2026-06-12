'use client'

// app/app/clients/[id]/client-time-filter.tsx
// Compact week / month / year / all-time selector — URL-driven via ?range=
// so the server component re-fetches with the appropriate date floor.

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'

export type ClientRange = 'all' | 'week' | 'month' | 'year'

const OPTIONS: { key: ClientRange; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'week', label: 'Last 7 days' },
  { key: 'month', label: 'Last 30 days' },
  { key: 'year', label: 'Last 365 days' },
]

export function ClientTimeFilter({ current }: { current: ClientRange }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  function setRange(range: ClientRange) {
    const params = new URLSearchParams(searchParams.toString())
    if (range === 'all') params.delete('range')
    else params.set('range', range)
    const qs = params.toString()
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  return (
    <div className="flex gap-1 flex-wrap">
      {OPTIONS.map((opt) => {
        const active = current === opt.key
        return (
          <Button
            key={opt.key}
            type="button"
            variant={active ? 'default' : 'outline'}
            size="sm"
            disabled={isPending && !active}
            onClick={() => setRange(opt.key)}
            className={
              active
                ? 'bg-lime-400 text-black hover:bg-lime-300 h-8'
                : 'h-8 border-neutral-700'
            }
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
