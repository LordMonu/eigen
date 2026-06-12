// app/app/users/page.tsx — master (full control) + manager (read-only).
// HF account access is rendered INLINE in every active member row
// (master only); the standalone Higgsfield Account Access section was
// removed in favor of that inline UX.
import { requireRole } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { ApprovalControls } from './approval-controls'
import { MemberControls } from './member-controls'
import { MemberHfAccess } from './member-hf-access'
import { InviteUserSection } from './invite-user-section'

export default async function UsersPage() {
  const membership = await requireRole(['master', 'manager'])
  const supabase = await createClient()

  const [
    { data: pending },
    { data: active },
    { data: connections },
    { data: grants },
    { data: invitations },
  ] = await Promise.all([
    supabase
      .from('memberships')
      .select('id, user_id, full_name, requested_at')
      .eq('org_id', membership.org_id)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false }),
    supabase
      .from('memberships')
      .select('id, user_id, full_name, role, approved_at')
      .eq('org_id', membership.org_id)
      .eq('status', 'active')
      .order('approved_at', { ascending: true }),
    supabase
      .from('hf_connections')
      .select('id, label, hf_email')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('hf_connection_grants')
      .select('id, connection_id, user_id')
      .eq('org_id', membership.org_id),
    supabase
      .from('invitations')
      .select('id, email, role, created_at, used_at, connection_ids')
      .eq('org_id', membership.org_id)
      .order('created_at', { ascending: false }),
  ])

  const masterCount = (active || []).filter((m) => m.role === 'master').length

  const connectionsList = (connections || []).map((c) => ({
    id: c.id,
    label: c.label,
    hf_email: c.hf_email,
  }))
  const grantsList = (grants || []).map((g) => ({
    id: g.id,
    connection_id: g.connection_id,
    user_id: g.user_id,
  }))

  return (
    <div className="p-6 space-y-8 text-neutral-100">
      <div>
        <h1 className="text-2xl font-bold text-white">Users &amp; Approvals</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Manage who can access {membership.org_name}.
        </p>
      </div>

      {/* INVITE (master only) */}
      {membership.role === 'master' && (
        <InviteUserSection
          orgId={membership.org_id}
          connections={connectionsList}
          initialInvitations={(invitations || []).map((i) => ({
            id: i.id,
            email: i.email,
            role: i.role,
            created_at: i.created_at,
            used_at: i.used_at,
            connection_ids: i.connection_ids || [],
          }))}
        />
      )}

      {/* PENDING */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h2 className="font-semibold text-white">Pending Requests</h2>
          <span className="text-yellow-400 text-sm">{pending?.length || 0}</span>
        </div>
        {!pending || pending.length === 0 ? (
          <div className="p-6 text-center text-neutral-500 text-sm">
            No pending requests.
          </div>
        ) : (
          <div className="divide-y divide-neutral-800">
            {pending.map((p) => (
              <div
                key={p.id}
                className="px-4 py-3 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="font-medium text-white">{p.full_name}</div>
                  <div className="text-xs text-neutral-500">
                    Requested {new Date(p.requested_at).toLocaleString()}
                  </div>
                </div>
                <ApprovalControls
                  membershipId={p.id}
                  userRole={membership.role}
                  connections={connectionsList}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ACTIVE — each row carries inline HF account access (master only).
          overflow-visible so the per-row HF-grants popover isn't clipped. */}
      <section className="bg-neutral-950 border border-neutral-800 rounded-lg">
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Active Members</h2>
            {membership.role === 'master' && connectionsList.length > 0 && (
              <p className="text-xs text-neutral-500 mt-0.5">
                The K / N HF pill on each row controls which Higgsfield accounts
                that member can sync from.
              </p>
            )}
          </div>
          <span className="text-green-400 text-sm">{active?.length || 0}</span>
        </div>
        <div className="divide-y divide-neutral-800">
          {active?.map((a) => {
            const role = a.role as 'master' | 'manager' | 'creator'
            const isYou = a.user_id === membership.user_id
            const isLastMaster = role === 'master' && masterCount <= 1
            return (
              <div
                key={a.id}
                className="relative px-4 py-3 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="font-medium text-white flex items-center gap-2">
                    {a.full_name}
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500">
                      {role}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500">
                    Joined {new Date(a.approved_at).toLocaleDateString('en-US')}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {membership.role === 'master' && (
                    <MemberHfAccess
                      orgId={membership.org_id}
                      memberUserId={a.user_id}
                      memberFullName={a.full_name}
                      enabled={role !== 'master'}
                      connections={connectionsList}
                      initialGrants={grantsList}
                    />
                  )}
                  <MemberControls
                    membershipId={a.id}
                    currentRole={role}
                    userRole={membership.role}
                    fullName={a.full_name}
                    isYou={isYou}
                    isLastMaster={isLastMaster}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
