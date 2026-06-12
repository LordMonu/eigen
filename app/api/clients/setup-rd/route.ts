import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: membership } = await supabase
      .from('memberships')
      .select('role, org_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || !['master', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only master/manager can create R&D client' }, { status: 403 })
    }

    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('org_id', membership.org_id)
      .eq('is_default', true)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ id: existing.id, created: false })
    }

    const { data: inserted, error } = await supabase
      .from('clients')
      .insert({
        name: 'R & D',
        status: 'ongoing',
        is_default: true,
        org_id: membership.org_id,
      })
      .select('id')
      .maybeSingle()

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 })
    }

    return NextResponse.json({ id: inserted.id, created: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Setup failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
