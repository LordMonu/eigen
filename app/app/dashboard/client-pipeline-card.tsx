'use client'

import { useState } from 'react'
import Link from 'next/link'
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
  CLIENT_STATUS_COLORS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface Props {
  statusCounts: Record<ClientStatus, number>
  total: number
}

export function ClientPipelineCard({ statusCounts, total }: Props) {
  const [selected, setSelected] = useState<ClientStatus | 'all'>('all')

  const displayCount = selected === 'all' ? total : statusCounts[selected]
  const displayLabel =
    selected === 'all'
      ? 'Total Clients'
      : `${CLIENT_STATUS_LABELS[selected]} Clients`

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
        <h2 className="font-semibold text-white">Client Pipeline</h2>
        <Select
          value={selected}
          onValueChange={(v) => setSelected(v as ClientStatus | 'all')}
        >
          <SelectTrigger className="w-40 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue>
              {(v) => {
                const val = v as string | null
                if (!val || val === 'all') return `All (${total})`
                return `${CLIENT_STATUS_LABELS[val as ClientStatus]} (${statusCounts[val as ClientStatus]})`
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({total})</SelectItem>
            {CLIENT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {CLIENT_STATUS_LABELS[s]} ({statusCounts[s]})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* BIG SELECTED NUMBER */}
      <div className="px-4 py-6 text-center border-b border-neutral-800">
        <div className="text-5xl font-bold text-white">{displayCount}</div>
        <div className="text-sm text-neutral-500 mt-2">{displayLabel}</div>
        {selected !== 'all' && (
          <Link
            href={`/app/clients?status=${selected}`}
            className="inline-block mt-3 text-xs text-lime-400 hover:underline"
          >
            View these clients →
          </Link>
        )}
      </div>

      {/* ALL CHIPS BELOW */}
      <div className="p-3 grid grid-cols-2 gap-2">
        {CLIENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/app/clients?status=${s}`}
            className={`px-3 py-2 rounded border text-xs flex items-center justify-between hover:opacity-80 transition-opacity ${CLIENT_STATUS_COLORS[s]}`}
          >
            <span>{CLIENT_STATUS_LABELS[s]}</span>
            <span className="font-bold">{statusCounts[s]}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
