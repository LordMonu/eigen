// app/app/dashboard/page.tsx — role-aware command center.
// Header renders instantly; KPIs + sections stream via Suspense.
import { Suspense } from 'react'
import { requireActiveMembership } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { fetchAllRows } from '@/lib/fetch-all-rows'
import { can } from '@/lib/rbac'
import { type ClientStatus } from '@/lib/client-helpers'
import {
  WORK_STATUS_COLORS,
  WORK_STATUS_LABELS,
  type WorkStatus,
  formatDeadline,
} from '@/lib/work-helpers'
import Link from 'next/link'
import { ClientPipelineCard } from './client-pipeline-card'

export default async function DashboardPage() {
  const membership = await requireActiveMembership()

  return (
    <div className="p-6 space-y-6 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Welcome back, {membership.full_name}.
        </p>
      </div>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  )
}

async function DashboardContent() {
  const membership = await requireActiveMembership()
  const supabase = await createClient()
  const isCreator = membership.role === 'creator'

  const [
    generations,
    { data: clients },
    { data: works },
    { data: memberships },
    { data: myWorkRows },
  ] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase
        .from('generations')
        .select('credits, client_id, work_id')
        .order('id')
        .range(from, to),
    ),
    supabase.from('clients').select('id, name, status'),
    supabase
      .from('works')
      .select(
        'id, title, video_type, status, end_date, end_time, client_id, creator_id, max_credits',
      ),
    supabase
      .from('memberships')
      .select('user_id, full_name')
      .eq('status', 'active'),
    supabase
      .from('work_creators')
      .select('work_id')
      .eq('user_id', membership.user_id),
  ])
  const myWorkIdsFromJoin = new Set(
    (myWorkRows || []).map((r) => r.work_id as string),
  )

  const totalCredits = (generations || []).reduce(
    (s, g) => s + parseFloat(g.credits || '0'),
    0
  )
  const unassignedCredits = (generations || [])
    .filter((g) => !g.client_id)
    .reduce((s, g) => s + parseFloat(g.credits || '0'), 0)

  const myWorkIds = new Set<string>([
    ...(works || [])
      .filter((w) => w.creator_id === membership.user_id)
      .map((w) => w.id),
    ...Array.from(myWorkIdsFromJoin),
  ])
  const myCreditsUsed = (generations || [])
    .filter((g) => g.work_id && myWorkIds.has(g.work_id))
    .reduce((s, g) => s + parseFloat(g.credits || '0'), 0)

  const totalClients = clients?.length || 0
  const totalWorks = works?.length || 0
  const activeWorks = (works || []).filter((w) => w.status !== 'completed')

  const clientStatusCounts: Record<ClientStatus, number> = {
    ongoing: 0,
    trial: 0,
    in_talk: 0,
    outreach: 0,
    paused: 0,
    ended: 0,
  }
  ;(clients || []).forEach((c) => {
    clientStatusCounts[c.status as ClientStatus]++
  })

  const worksPerClient = new Map<string, number>()
  ;(works || []).forEach((w) => {
    worksPerClient.set(w.client_id, (worksPerClient.get(w.client_id) || 0) + 1)
  })
  const worksPerClientRanked = Array.from(worksPerClient.entries())
    .map(([clientId, count]) => ({
      clientId,
      clientName: clients?.find((c) => c.id === clientId)?.name || 'Unknown',
      count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const twoWeeksFromNow = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
  const todayStr = today.toISOString().split('T')[0]
  const twoWeeksStr = twoWeeksFromNow.toISOString().split('T')[0]

  const nearDeadline = (works || [])
    .filter(
      (w) =>
        w.status !== 'completed' &&
        w.end_date &&
        w.end_date >= todayStr &&
        w.end_date <= twoWeeksStr
    )
    .sort((a, b) => (a.end_date || '').localeCompare(b.end_date || ''))
    .slice(0, 10)

  const needsAttention = isCreator
    ? (works || []).filter(
        (w) => w.status === 'rework' && myWorkIds.has(w.id),
      )
    : (works || []).filter((w) => w.status === 'in_review')

  const myWorkStatusCounts: Record<WorkStatus, number> = {
    ongoing: 0,
    in_review: 0,
    rework: 0,
    paused: 0,
    completed: 0,
  }
  ;(works || []).forEach((w) => {
    myWorkStatusCounts[w.status as WorkStatus]++
  })

  const memberNameMap = new Map(
    (memberships || []).map((m) => [m.user_id, m.full_name])
  )
  const clientNameMap = new Map((clients || []).map((c) => [c.id, c.name]))

  function daysUntil(dateStr: string): number {
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  }

  return (
    <>
      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {isCreator ? (
          <>
            <KpiCard
              label="Unassigned Credits"
              value={unassignedCredits.toFixed(1)}
              subtext="pending attribution"
              color="yellow"
              href="/app/sync"
            />
            <KpiCard
              label="My Credits Used"
              value={myCreditsUsed.toFixed(1)}
              subtext="across my works"
              color="white"
            />
            <KpiCard
              label="My Active Works"
              value={
                myWorkStatusCounts.ongoing +
                myWorkStatusCounts.in_review +
                myWorkStatusCounts.rework +
                myWorkStatusCounts.paused
              }
              subtext={`${totalWorks} total`}
              color="blue"
              href="/app/works"
            />
            <KpiCard
              label="In Review"
              value={myWorkStatusCounts.in_review}
              subtext="awaiting manager"
              color="purple"
              href="/app/works?status=in_review"
            />
          </>
        ) : (
          <>
            <KpiCard
              label="Total Credits"
              value={totalCredits.toFixed(1)}
              subtext={`${generations?.length || 0} generations`}
              color="white"
            />
            <KpiCard
              label="Unassigned Credits"
              value={unassignedCredits.toFixed(1)}
              subtext="needs attribution"
              color="yellow"
              href="/app/sync"
            />
            <KpiCard
              label="Total Clients"
              value={totalClients}
              subtext={`${clientStatusCounts.ongoing} ongoing`}
              color="blue"
              href="/app/clients"
            />
            <KpiCard
              label="Active Works"
              value={activeWorks.length}
              subtext={`${totalWorks} total`}
              color="green"
              href="/app/works"
            />
          </>
        )}
      </div>

      {/* NEEDS ATTENTION */}
      {needsAttention.length > 0 && (
        <section
          className={`rounded-lg overflow-hidden border ${
            isCreator
              ? 'bg-orange-950/30 border-orange-900'
              : 'bg-purple-950/30 border-purple-900'
          }`}
        >
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white">
              {isCreator ? '⚠ Needs Your Revision' : '👀 Needs Your Approval'}
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {isCreator
                ? 'These works were sent back to you for changes'
                : 'Works submitted for review'}
            </p>
          </div>
          <div className="divide-y divide-neutral-800">
            {needsAttention.slice(0, 5).map((w) => (
              <Link
                key={w.id}
                href={`/app/works/${w.id}`}
                className="block px-4 py-3 hover:bg-neutral-900/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-white">
                      {w.title || w.video_type || 'Untitled work'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {clientNameMap.get(w.client_id) || 'Unknown client'}
                      {!isCreator &&
                        ` · by ${memberNameMap.get(w.creator_id) || 'Unknown'}`}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${WORK_STATUS_COLORS[w.status as WorkStatus]}`}
                  >
                    {WORK_STATUS_LABELS[w.status as WorkStatus]}
                  </span>
                </div>
              </Link>
            ))}
            {needsAttention.length > 5 && (
              <Link
                href={`/app/works?status=${isCreator ? 'rework' : 'in_review'}`}
                className="block px-4 py-2 text-center text-xs text-lime-400 hover:bg-neutral-900/40"
              >
                View all {needsAttention.length} →
              </Link>
            )}
          </div>
        </section>
      )}

      {/* NEAR DEADLINE */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800">
          <h2 className="font-semibold text-white">📅 Near Deadline</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {isCreator ? 'Your' : 'All'} works due in the next 14 days
          </p>
        </div>
        {nearDeadline.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            <p>No upcoming deadlines.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {nearDeadline.map((w) => {
              const daysLeft = daysUntil(w.end_date!)
              const urgencyColor =
                daysLeft <= 1
                  ? 'text-red-400'
                  : daysLeft <= 3
                    ? 'text-orange-400'
                    : daysLeft <= 7
                      ? 'text-yellow-400'
                      : 'text-neutral-300'

              return (
                <Link
                  key={w.id}
                  href={`/app/works/${w.id}`}
                  className="block px-4 py-3 hover:bg-neutral-900/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-white truncate">
                        {w.title || w.video_type || 'Untitled'}
                      </div>
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-2">
                        <span>
                          {clientNameMap.get(w.client_id) || 'Unknown client'}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded border text-xs ${WORK_STATUS_COLORS[w.status as WorkStatus]}`}
                        >
                          {WORK_STATUS_LABELS[w.status as WorkStatus]}
                        </span>
                        {!isCreator && (
                          <span className="text-neutral-600">
                            · {memberNameMap.get(w.creator_id) || 'Unknown'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <div className={`text-sm font-bold ${urgencyColor}`}>
                        {daysLeft === 0
                          ? 'Today'
                          : daysLeft === 1
                            ? 'Tomorrow'
                            : `${daysLeft} days`}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {formatDeadline(w.end_date, w.end_time)}
                      </div>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* MASTER/MANAGER LOWER GRID */}
      {!isCreator && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ClientPipelineCard
            statusCounts={clientStatusCounts}
            total={totalClients}
          />

          <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-800">
              <h2 className="font-semibold text-white">Works per Client</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Top 10 by volume</p>
            </div>
            {worksPerClientRanked.length === 0 ? (
              <div className="p-6 text-center text-neutral-500 text-sm">
                No works yet.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800 max-h-80 overflow-auto">
                {worksPerClientRanked.map((row, i) => (
                  <Link
                    key={row.clientId}
                    href={`/app/clients/${row.clientId}`}
                    className="block px-4 py-2 hover:bg-neutral-900/40 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-600 text-xs w-5">
                          #{i + 1}
                        </span>
                        <span className="text-sm text-white">
                          {row.clientName}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-neutral-400">
                        {row.count} {row.count === 1 ? 'work' : 'works'}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* CREATOR LOWER: own work breakdown */}
      {isCreator && (
        <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800">
            <h2 className="font-semibold text-white">My Works by Status</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-neutral-800">
            {(
              ['ongoing', 'in_review', 'rework', 'paused', 'completed'] as WorkStatus[]
            ).map((s) => (
              <Link
                key={s}
                href={`/app/works?status=${s}`}
                className="px-4 py-4 text-center hover:bg-neutral-900/40 transition-colors"
              >
                <div className="text-2xl font-bold text-white">
                  {myWorkStatusCounts[s]}
                </div>
                <div className="text-xs text-neutral-500 mt-1">
                  {WORK_STATUS_LABELS[s]}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function KpiCard({
  label,
  value,
  subtext,
  color,
  href,
}: {
  label: string
  value: string | number
  subtext: string
  color: 'white' | 'yellow' | 'blue' | 'green' | 'purple'
  href?: string
}) {
  const valueColors: Record<string, string> = {
    white: 'text-white',
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
  }

  const card = (
    <div className="bg-neutral-950 border border-neutral-800 rounded-lg p-4 h-full hover:border-neutral-600 transition-colors">
      <p className="text-neutral-400 text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${valueColors[color]} mt-1`}>{value}</p>
      <p className="text-neutral-500 text-xs mt-1">{subtext}</p>
    </div>
  )

  return href ? <Link href={href}>{card}</Link> : card
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="h-24 rounded-lg bg-neutral-900" />
        <div className="h-24 rounded-lg bg-neutral-900" />
        <div className="h-24 rounded-lg bg-neutral-900" />
        <div className="h-24 rounded-lg bg-neutral-900" />
      </div>
      <div className="h-48 rounded-lg bg-neutral-900" />
      <div className="h-64 rounded-lg bg-neutral-900" />
    </div>
  )
}
