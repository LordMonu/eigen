'use client'

import { CalendarDays, LayoutGrid } from 'lucide-react'

type ViewMode = 'calendar' | 'cards'

interface Props {
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}

export function ViewToggle({ view, onViewChange }: Props) {
  return (
    <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
      <button
        onClick={() => onViewChange('calendar')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          view === 'calendar'
            ? 'bg-lime-400 text-black'
            : 'text-neutral-400 hover:text-white'
        }`}
      >
        <CalendarDays className="size-3.5" />
        Calendar
      </button>
      <button
        onClick={() => onViewChange('cards')}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
          view === 'cards'
            ? 'bg-lime-400 text-black'
            : 'text-neutral-400 hover:text-white'
        }`}
      >
        <LayoutGrid className="size-3.5" />
        Cards
      </button>
    </div>
  )
}
