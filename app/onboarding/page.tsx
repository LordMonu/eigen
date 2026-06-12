// app/onboarding/page.tsx — choose: create an org or join one.
import { requireUser } from '@/lib/auth-helpers'
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card } from '@/components/ui/card'

export default async function OnboardingPage() {
  const user = await requireUser()

  // If the user already has any membership, skip this page.
  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('memberships')
    .select('status')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (existing?.status === 'active') redirect('/app/dashboard')
  if (existing?.status === 'pending') redirect('/onboarding/pending')

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Welcome to Eigen</h1>
          <p className="text-neutral-400 mt-2">Let&apos;s get you set up. Choose one:</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/onboarding/create-org">
            <Card className="p-6 bg-neutral-950 border-neutral-800 hover:border-lime-500 transition-colors cursor-pointer h-full">
              <div className="text-3xl mb-3">🏢</div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Create Organization
              </h2>
              <p className="text-neutral-400 text-sm">
                Start fresh. You&apos;ll be the master admin, set up clients, and
                invite your team.
              </p>
            </Card>
          </Link>

          <Link href="/onboarding/join-org">
            <Card className="p-6 bg-neutral-950 border-neutral-800 hover:border-lime-500 transition-colors cursor-pointer h-full">
              <div className="text-3xl mb-3">👋</div>
              <h2 className="text-xl font-semibold text-white mb-2">
                Join Organization
              </h2>
              <p className="text-neutral-400 text-sm">
                Your team is already on the platform? Request to join, wait for
                the admin to approve.
              </p>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
