import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { logActivity, type EntityType, type Action } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { entityType, entityId, action, fromValue, toValue } =
      (await req.json()) as {
        entityType: EntityType
        entityId: string
        action: Action
        fromValue?: string
        toValue?: string
      }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id, full_name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('approved_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

    await logActivity(supabase, {
      orgId: membership.org_id,
      entityType,
      entityId,
      action,
      fromValue,
      toValue,
      actorName: membership.full_name,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 })
  }
}
