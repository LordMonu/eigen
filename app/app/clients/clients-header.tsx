'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
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
  canCreate: boolean
}

export function ClientsHeader({
  totalCount,
  statusCounts,
  activeFilter,
  canCreate,
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function handleFilterChange(value: string) {
    const url = value === 'all' ? '/app/clients' : `/app/clients?status=${value}`
    router.push(url)
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-neutral-400 text-sm mt-1">
            Manage your client pipeline. Status order: ongoing → trial → in talks
            → outreach → paused → ended.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={activeFilter}
            onValueChange={(v) => handleFilterChange(v as string)}
          >
            <SelectTrigger className="w-52 bg-neutral-900 border-neutral-700">
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
              className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
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
