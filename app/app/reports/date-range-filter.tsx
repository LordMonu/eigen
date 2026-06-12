'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  fromDate: string
  toDate: string
}

// Parent keys this component by `${fromDate}-${toDate}`, so it remounts (and
// re-initializes from props) whenever the applied range changes — no effect needed.
export function DateRangeFilter({ fromDate, toDate }: Props) {
  const router = useRouter()
  const [from, setFrom] = useState(fromDate)
  const [to, setTo] = useState(toDate)

  function applyRange(daysBack: number) {
    const now = new Date()
    const fromD = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000)
    const fromStr = fromD.toISOString().split('T')[0]
    const toStr = now.toISOString().split('T')[0]
    router.push(`/app/reports?from=${fromStr}&to=${toStr}`)
  }

  function applyCustom() {
    if (from > to) {
      alert('Start date must be before end date')
      return
    }
    router.push(`/app/reports?from=${from}&to=${to}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => applyRange(7)}
        className="border-neutral-700"
      >
        7d
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => applyRange(30)}
        className="border-neutral-700"
      >
        30d
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => applyRange(90)}
        className="border-neutral-700"
      >
        90d
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => applyRange(365)}
        className="border-neutral-700"
      >
        1y
      </Button>
      <span className="text-neutral-500 text-xs mx-1">or</span>
      <Input
        type="date"
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        className="h-8 w-36 bg-neutral-900 border-neutral-700 text-sm"
      />
      <span className="text-neutral-500">→</span>
      <Input
        type="date"
        value={to}
        onChange={(e) => setTo(e.target.value)}
        className="h-8 w-36 bg-neutral-900 border-neutral-700 text-sm"
      />
      <Button
        size="sm"
        onClick={applyCustom}
        className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
      >
        Apply
      </Button>
    </div>
  )
}
