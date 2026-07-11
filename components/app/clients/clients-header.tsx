'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  type ClientStatus,
} from '@/lib/client-helpers'
import { ClientFormDialog } from './client-form-dialog'

interface Props {
  totalCount: number
  statusCounts: Record<ClientStatus, number>
  activeFilter: string
  activeQuery: string
  canCreate: boolean
}

export function ClientsHeader({
  totalCount,
  statusCounts,
  activeFilter,
  activeQuery,
  canCreate,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(activeQuery)

  function pushFilters(nextStatus: string, nextQuery: string) {
    const params = new URLSearchParams()
    if (nextStatus !== 'all') params.set('status', nextStatus)
    const trimmedQuery = nextQuery.trim()
    if (trimmedQuery) params.set('q', trimmedQuery)
    const qs = params.toString()
    router.replace(qs ? `/app/clients?${qs}` : '/app/clients')
  }

  function handleFilterChange(value: string) {
    pushFilters(value, query)
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    pushFilters(activeFilter, query)
  }

  function clearSearch() {
    setQuery('')
    pushFilters(activeFilter, '')
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white">Clients</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Manage your client pipeline. Status order: ongoing → trial → in talks
            → outreach → paused → ended.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 shrink-0">
          <form
            onSubmit={handleSearchSubmit}
            className="flex w-full items-center gap-2 sm:w-auto"
          >
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter clients"
                className="h-9 border-neutral-700 bg-neutral-900 pl-8 pr-8 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-500 transition hover:text-white"
                  aria-label="Clear client filter"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="outline"
              className="h-9 shrink-0 border-neutral-700 bg-neutral-900 text-xs"
            >
              Filter
            </Button>
          </form>

          <Select
            value={activeFilter}
            onValueChange={(v) => handleFilterChange(v as string)}
          >
            <SelectTrigger className="w-full sm:w-52 bg-neutral-900 border-neutral-700">
              <SelectValue>
                {(v) => {
                  const val = v as string | null
                  if (!val || val === 'all') return `All Clients (${totalCount})`
                  return `${CLIENT_STATUS_LABELS[val as ClientStatus]} (${statusCounts[val as ClientStatus]})`
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Clients ({totalCount})</SelectItem>
              {CLIENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {CLIENT_STATUS_LABELS[status]} ({statusCounts[status]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {canCreate && (
            <Button
              onClick={() => setOpen(true)}
              className="w-full sm:w-auto bg-lime-400 hover:bg-lime-300 text-black font-semibold"
            >
              + New Client
            </Button>
          )}
        </div>
      </div>

      <ClientFormDialog open={open} onOpenChange={setOpen} mode="create" />
    </>
  )
}
