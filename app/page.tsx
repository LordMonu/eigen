// app/page.tsx — landing. Routes signed-in users to the right place.
import { createClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { LoginButton } from './login-button'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Already signed in? Route based on membership state.
  if (user) {
    const { data: active } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (active) redirect('/app/dashboard')

    const { data: pending } = await supabase
      .from('memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .limit(1)
      .maybeSingle()

    if (pending) redirect('/onboarding/pending')
    redirect('/onboarding')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="text-center space-y-8 max-w-lg">
        <div className="space-y-3">
          <h1 className="text-7xl font-bold text-white tracking-tighter">Eigen</h1>
          <p className="text-neutral-300 text-lg">
            Every Higgsfield generation, resolved to the client it belongs to.
          </p>
          <p className="text-neutral-600 text-sm">
            <span className="text-lime-400">eigen</span> — the definite state a
            system collapses to once measured; that which is one&apos;s own.
          </p>
        </div>
        <LoginButton />
      </div>
    </div>
  )
}
