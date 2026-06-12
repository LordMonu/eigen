// app/api/works/[id]/assign-generation/route.ts — assign a generation to BOTH client + work.
// Cross-client assignment: if the caller picks a client that DOESN'T match
// the work in the URL, work_id is set to NULL (the generation is attributed
// to that client at the client level, with no specific work owning it).
// This lets the Sync & Assign modal redirect credits to any client in the org
// from a single work-detail flow.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workId } = await params
    const { generationId, clientId } = await req.json()
    if (!generationId || !clientId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
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
      .select('id, client_id, creator_id, org_id, title')
      .eq('id', workId)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role, full_name')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Any of the work's creators can assign to this work (multi-creator).
    // For cross-client assignments, only master/manager can redirect credits.
    const isCrossClient = work.client_id !== clientId
    let isCreator = work.creator_id === user.id
    if (!isCreator && membership.role === 'creator' && !isCrossClient) {
      const { data: coOwner } = await supabase
        .from('work_creators')
        .select('user_id')
        .eq('work_id', workId)
        .eq('user_id', user.id)
        .maybeSingle()
      isCreator = !!coOwner
    }
    const canAssign =
      membership.role === 'master' ||
      membership.role === 'manager' ||
      (!isCrossClient && isCreator)
    if (!canAssign) {
      return NextResponse.json(
        { error: 'Cannot assign to this client' },
        { status: 403 }
      )
    }

    // If the picked client matches the current work, tie the generation to
    // that work. If it doesn't, attribute at the client level only.
    const effectiveWorkId = isCrossClient ? null : workId

    const { error } = await supabase
      .from('generations')
      .update({
        client_id: clientId,
        work_id: effectiveWorkId,
        assigned_at: new Date().toISOString(),
        assigned_by: user.id,
      })
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch generation details for the log label
    const { data: gen } = await supabase
      .from('generations')
      .select('display_name, credits')
      .eq('id', generationId)
      .maybeSingle()
    const genLabel = gen ? `${gen.display_name} (${parseFloat(gen.credits || '0').toFixed(2)} cr)` : generationId

    logActivity(supabase, {
      orgId: work.org_id,
      entityType: 'work',
      entityId: effectiveWorkId ?? workId,
      action: 'assigned',
      fromValue: null,
      toValue: genLabel,
      actorName: membership?.full_name ?? 'Unknown',
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assign failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
