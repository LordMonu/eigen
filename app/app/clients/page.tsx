// app/app/clients/page.tsx — clients list, filterable by status, fixed-order grid.
// Uses clients_with_credit_totals() RPC: 1 round-trip instead of pulling every
// generation row in the org just to sum per-client credits client-side.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { can } from '@/lib/rbac'
import {
  CLIENT_STATUSES,
  CLIENT_STATUS_LABELS,
  sortClientsByStatus,
  type ClientStatus,
} from '@/lib/client-helpers'
import { ClientCard } from './client-card'
import { ClientsHeader } from './clients-header'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

interface ClientRpcRow {
  id: string
  name: string
  industry: string | null
  status: string
  total_credits: string | number
  generation_count: string | number
}

export default async function ClientsPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { status: filterStatus } = await searchParams

  // SINGLE WAVE — auth + RPC in parallel. RLS validates the JWT from
  // cookies independently, so the RPC returns correct results while auth resolves.
  const [membership, { data: rows, error }] = await Promise.all([
    requireActiveMembership(),
    supabase.rpc('clients_with_credit_totals'),
  ])
  if (error) {
    console.error('[clients] clients_with_credit_totals RPC failed:', error.message)
  }

  const enrichedClients = ((rows || []) as ClientRpcRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    industry: c.industry,
    status: c.status as ClientStatus,
    totalCredits:
      typeof c.total_credits === 'number'
        ? c.total_credits
        : parseFloat(c.total_credits || '0'),
    generationCount:
      typeof c.generation_count === 'number'
        ? c.generation_count
        : parseInt(c.generation_count || '0', 10),
  }))

  const statusCounts: Record<ClientStatus, number> = {
    ongoing: 0,
    trial: 0,
    in_talk: 0,
    outreach: 0,
    paused: 0,
    ended: 0,
  }
  enrichedClients.forEach((c) => {
    statusCounts[c.status]++
  })

  const visibleClients =
    filterStatus && filterStatus !== 'all'
      ? enrichedClients.filter((c) => c.status === filterStatus)
      : enrichedClients

  const sorted = sortClientsByStatus(visibleClients)
  const canCreate = can(membership.role, 'clients', 'create')
  const showSections = !filterStatus || filterStatus === 'all'

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <ClientsHeader
        totalCount={enrichedClients.length}
        statusCounts={statusCounts}
        activeFilter={filterStatus || 'all'}
        canCreate={canCreate}
      />

      {sorted.length === 0 ? (
        <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-12 text-center">
          <p className="text-neutral-400">No clients yet.</p>
          {canCreate && (
            <p className="text-neutral-500 text-sm mt-2">
              Use the + New Client button above to create your first one.
            </p>
          )}
        </div>
      ) : showSections ? (
        <div className="space-y-8">
          {CLIENT_STATUSES.map((status) => {
            const inStatus = sorted.filter((c) => c.status === status)
            if (inStatus.length === 0) return null
            return (
              <section key={status} className="space-y-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-xs uppercase tracking-wider font-semibold text-neutral-400">
                    {CLIENT_STATUS_LABELS[status]}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    ({inStatus.length})
                  </span>
                  <div className="flex-1 border-t border-neutral-800" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {inStatus.map((c) => (
                    <ClientCard key={c.id} client={c} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((c) => (
            <ClientCard key={c.id} client={c} />
          ))}
        </div>
      )}
    </div>
  )
}
