'use client'

import { useRouter } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'

interface Generation {
  id: string
  display_name: string
  result_url: string
  media_type: string
  credits: number
  hf_created_at: string
  client_name: string
  creator_name: string
}

interface Props {
  generations: Generation[]
  clients: { id: string; name: string }[]
  memberships: { user_id: string; full_name: string }[]
  models: string[]
  activeFilters: {
    clientId?: string
    model?: string
    creatorId?: string
  }
  fromDate: string
  toDate: string
}

function MediaPreview({
  url,
  mediaType,
  name,
}: {
  url: string
  mediaType: string
  name: string
}) {
  if (mediaType === 'video') {
    return (
      <video
        src={url}
        className="w-12 h-9 rounded object-cover bg-black"
        preload="metadata"
        muted
      />
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      className="w-12 h-9 rounded object-cover bg-neutral-800"
      loading="lazy"
    />
  )
}

export function GenerationsDrilldown({
  generations,
  clients,
  memberships,
  models,
  activeFilters,
  fromDate,
  toDate,
}: Props) {
  const router = useRouter()

  function updateFilter(
    key: 'clientId' | 'model' | 'creatorId',
    value: string
  ) {
    const params = new URLSearchParams()
    params.set('from', fromDate)
    params.set('to', toDate)
    Object.entries(activeFilters).forEach(([k, v]) => {
      if (v && k !== key) params.set(k, v)
    })
    if (value !== '__all') params.set(key, value)
    router.push(`/app/reports?${params.toString()}`)
  }

  function clearAll() {
    router.push(`/app/reports?from=${fromDate}&to=${toDate}`)
  }

  const hasActiveFilter = !!(
    activeFilters.clientId ||
    activeFilters.model ||
    activeFilters.creatorId
  )

  return (
    <>
      {/* FILTER BAR */}
      <div className="px-4 py-2 border-b border-neutral-800 flex flex-wrap items-center gap-2 bg-black/40">
        <Select
          value={activeFilters.clientId || '__all'}
          onValueChange={(v) => updateFilter('clientId', v as string)}
        >
          <SelectTrigger className="w-44 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue>
              {(v) => {
                const val = v as string | null
                if (!val || val === '__all') return 'All clients'
                return clients.find((c) => c.id === val)?.name ?? 'Unknown'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeFilters.model || '__all'}
          onValueChange={(v) => updateFilter('model', v as string)}
        >
          <SelectTrigger className="w-44 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue placeholder="All models" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All models</SelectItem>
            {models.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={activeFilters.creatorId || '__all'}
          onValueChange={(v) => updateFilter('creatorId', v as string)}
        >
          <SelectTrigger className="w-44 h-8 text-xs bg-neutral-900 border-neutral-700">
            <SelectValue>
              {(v) => {
                const val = v as string | null
                if (!val || val === '__all') return 'All creators'
                return memberships.find((m) => m.user_id === val)?.full_name ?? 'Unknown'
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All creators</SelectItem>
            {memberships.map((m) => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasActiveFilter && (
          <Button
            size="sm"
            variant="outline"
            onClick={clearAll}
            className="h-8 text-xs"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* TABLE */}
      {generations.length === 0 ? (
        <div className="p-8 text-center text-neutral-500 text-sm">
          No generations match these filters.
        </div>
      ) : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-950 border-b border-neutral-800">
              <tr className="text-xs text-neutral-500">
                <th className="text-left py-2 px-3">Preview</th>
                <th className="text-left py-2 px-3">Model</th>
                <th className="text-left py-2 px-3">Client</th>
                <th className="text-left py-2 px-3">Creator</th>
                <th className="text-left py-2 px-3">Date</th>
                <th className="text-right py-2 px-3">Credits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {generations.map((g) => (
                <tr key={g.id} className="hover:bg-neutral-900/40">
                  <td className="py-2 px-3">
                    <MediaPreview
                      url={g.result_url}
                      mediaType={g.media_type}
                      name={g.display_name}
                    />
                  </td>
                  <td className="py-2 px-3 text-white">{g.display_name}</td>
                  <td className="py-2 px-3 text-neutral-300">{g.client_name}</td>
                  <td className="py-2 px-3 text-neutral-300">{g.creator_name}</td>
                  <td className="py-2 px-3 text-neutral-500 text-xs">
                    {new Date(g.hf_created_at).toLocaleDateString('en-US')}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-bold ${g.credits > 0 ? 'text-orange-400' : 'text-neutral-600'}`}
                  >
                    {g.credits > 0 ? g.credits.toFixed(1) : 'free'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
