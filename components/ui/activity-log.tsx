'use client'

interface LogEntry {
  id: string
  action: string
  from_value: string | null
  to_value: string | null
  actor_name: string
  created_at: string
}

interface Props {
  entries: LogEntry[]
}

const ACTION_LABELS: Record<string, string> = {
  status_changed: 'Status changed',
  edited: 'Edited',
  archived: 'Archived',
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function ActivityLog({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-neutral-500 text-sm">
        No activity yet.
      </div>
    )
  }

  return (
    <div className="divide-y divide-neutral-800/60">
      {entries.map((e) => (
        <div key={e.id} className="px-4 py-3 flex items-start justify-between gap-3 text-sm">
          <div className="flex-1 min-w-0">
            <span className="text-neutral-200 font-medium">{e.actor_name}</span>
            <span className="text-neutral-500 ml-1.5">{ACTION_LABELS[e.action] ?? e.action}</span>
            {e.from_value && e.to_value && (
              <span className="text-neutral-500 ml-1.5">
                <span className="text-neutral-400 line-through text-xs">{e.from_value.replace(/_/g, ' ')}</span>
                {' → '}
                <span className="text-neutral-300 text-xs">{e.to_value.replace(/_/g, ' ')}</span>
              </span>
            )}
            {e.from_value && !e.to_value && e.action !== 'archived' && (
              <span className="text-neutral-500 ml-1.5 text-xs">from <span className="text-neutral-400">{e.from_value.replace(/_/g, ' ')}</span></span>
            )}
          </div>
          <div className="text-xs text-neutral-600 whitespace-nowrap shrink-0 mt-0.5">
            {formatDateTime(e.created_at)}
          </div>
        </div>
      ))}
    </div>
  )
}
