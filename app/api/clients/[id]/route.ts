import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: client } = await supabase
      .from('clients')
      .select('id, org_id, is_default')
      .eq('id', id)
      .maybeSingle()
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }
    if (client.is_default) {
      return NextResponse.json({ error: 'The R&D client cannot be archived' }, { status: 403 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role, full_name')
      .eq('user_id', user.id)
      .eq('org_id', client.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || (membership.role !== 'master' && membership.role !== 'manager')) {
      return NextResponse.json({ error: 'Only master/manager can delete clients' }, { status: 403 })
    }

    const { error } = await supabase
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Soft-delete all works belonging to this client
    await supabase
      .from('works')
      .update({ deleted_at: new Date().toISOString() })
      .eq('client_id', id)
      .is('deleted_at', null)

    logActivity(supabase, { orgId: client.org_id, entityType: 'client', entityId: id, action: 'archived', fromValue: null, toValue: null, actorName: membership.full_name ?? 'Unknown' })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
