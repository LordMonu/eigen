import Link from 'next/link'
import {
  CLIENT_STATUS_COLORS,
  CLIENT_STATUS_LABELS,
  type ClientStatus,
} from '@/lib/client-helpers'

interface Props {
  client: {
    id: string
    name: string
    industry: string | null
    status: ClientStatus
    totalCredits: number
    generationCount: number
  }
}

export function ClientCard({ client }: Props) {
  return (
    <Link
      href={`/app/clients/${client.id}`}
      className="block bg-neutral-950 border border-neutral-800 hover:border-neutral-600 rounded-lg p-4 transition-colors group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-semibold text-white group-hover:text-lime-400 transition-colors truncate flex-1">
          {client.name}
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded border ${CLIENT_STATUS_COLORS[client.status]} whitespace-nowrap`}
        >
          {CLIENT_STATUS_LABELS[client.status]}
        </span>
      </div>

      <p className="text-neutral-400 text-sm mb-4">
        {client.industry || (
          <span className="text-neutral-600">No industry set</span>
        )}
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
        <div className="text-xs text-neutral-500">
          {client.generationCount > 0
            ? `${client.generationCount} generation${client.generationCount > 1 ? 's' : ''}`
            : 'No generations assigned'}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-white">
            {client.totalCredits > 0 ? client.totalCredits.toFixed(1) : '0'}
          </div>
          <div className="text-xs text-neutral-500">credits</div>
        </div>
      </div>
    </Link>
  )
}
