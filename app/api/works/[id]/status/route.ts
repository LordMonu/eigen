// app/api/works/[id]/status/route.ts — status transitions with server-side enforcement.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import type { WorkStatus } from '@/lib/work-helpers'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Role = 'master' | 'manager' | 'creator'

const ALLOWED: Record<
  WorkStatus,
  { roles: Role[]; from: WorkStatus[]; ownWorkOnly?: boolean }[]
> = {
  in_review: [
    {
      roles: ['creator', 'manager'],
      from: ['ongoing', 'rework'],
      ownWorkOnly: true,
    },
  ],
  paused: [{ roles: ['master', 'manager'], from: ['ongoing', 'rework'] }],
  ongoing: [{ roles: ['master', 'manager'], from: ['paused'] }],
  rework: [{ roles: ['master', 'manager'], from: ['in_review'] }],
  completed: [{ roles: ['master', 'manager'], from: ['in_review'] }],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { to } = (await req.json()) as { to: WorkStatus }
    if (!to || !ALLOWED[to]) {
      return NextResponse.json({ error: 'Invalid target status' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: work } = await supabase
      .from('works')
      .select('id, org_id, creator_id, status, client_id')
      .eq('id', id)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    // Section 1 — Client→Work cascade lock. If the client is paused/ended,
    // its works are locked: nobody (not even master) can flip status from
    // the work surface. The only way out is to change the client back to
    // an active state, which the cascade RPC will then unlock paused works
    // through. Server-side check defends against a stale UI button click
    // (the dropdown will normally be disabled, but UI state can drift).
    if (work.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('status')
        .eq('id', work.client_id)
        .maybeSingle()
      if (client && (client.status === 'paused' || client.status === 'ended')) {
        return NextResponse.json(
          {
            error: `Work is locked — its client is ${client.status}. Change the client status to unlock.`,
          },
          { status: 409 },
        )
      }
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this org' },
        { status: 403 }
      )
    }

    const role = membership.role as Role
    // Multi-creator: any user listed in work_creators counts as "own",
    // not just the primary creator_id. We still let the primary path
    // short-circuit so we don't do an extra query when it's enough.
    let isOwn = work.creator_id === user.id
    if (!isOwn) {
      const { data: coOwner } = await supabase
        .from('work_creators')
        .select('user_id')
        .eq('work_id', id)
        .eq('user_id', user.id)
        .maybeSingle()
      isOwn = !!coOwner
    }
    const currentStatus = work.status as WorkStatus

    const rule = ALLOWED[to].find((r) => r.roles.includes(role))
    if (!rule) {
      return NextResponse.json(
        { error: `${role} cannot transition to ${to}` },
        { status: 403 }
      )
    }
    if (!rule.from.includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot move from ${currentStatus} to ${to}` },
        { status: 400 }
      )
    }
    if (rule.ownWorkOnly && !isOwn) {
      return NextResponse.json(
        { error: 'Only the assigned creator can do this' },
        { status: 403 }
      )
    }

    const { error } = await supabase
      .from('works')
      .update({ status: to })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: mem } = await supabase
      .from('memberships')
      .select('full_name')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .maybeSingle()
    logActivity(supabase, {
      orgId: work.org_id,
      entityType: 'work',
      entityId: id,
      action: 'status_changed',
      fromValue: currentStatus,
      toValue: to,
      actorName: mem?.full_name ?? 'Unknown',
    })

    return NextResponse.json({ success: true, status: to })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transition failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
