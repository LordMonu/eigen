// app/onboarding/pending/page.tsx — shown while a join request awaits approval.
import { requireUser } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'

function extractOrgName(organizations: unknown): string {
  if (Array.isArray(organizations)) {
    return organizations[0]?.name ?? 'the organization'
  }
  if (organizations && typeof organizations === 'object' && 'name' in organizations) {
    return (organizations as { name: string }).name
  }
  return 'the organization'
}

export default async function PendingPage() {
  const user = await requireUser()
  const supabase = await createClient()

  // Maybe the admin already approved.
  const { data: membership } = await supabase
    .from('memberships')
    .select('status, organizations(name)')
    .eq('user_id', user.id)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (membership?.status === 'active') redirect('/app/dashboard')
  if (!membership) redirect('/onboarding')

  const orgName = extractOrgName(membership.organizations)

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md text-center space-y-6">
        <div className="text-5xl">⏳</div>
        <div>
          <h1 className="text-2xl font-bold text-white">Waiting for approval</h1>
          <p className="text-neutral-400 mt-2">
            Your request to join{' '}
            <span className="text-white font-medium">{orgName}</span> is pending.
            The admin will be notified — you&apos;ll get access once they approve.
          </p>
        </div>
        <p className="text-neutral-500 text-sm">Refresh this page to check status.</p>
      </div>
    </div>
  )
}
