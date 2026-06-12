// app/api/works/[id]/route.ts — edit + delete a work.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** PATCH — edit work fields (master/manager only). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: work } = await supabase
      .from('works')
      .select('id, org_id')
      .eq('id', id)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || (membership.role !== 'master' && membership.role !== 'manager')) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Only allow specific fields to be updated. `creator_ids` is handled
    // separately below since it needs to sync the work_creators join table.
    const allowedFields = [
      'title', 'creator_id', 'video_type', 'max_credits',
      'start_date', 'end_date', 'start_time', 'end_time', 'notes',
    ]
    const update: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (key in body) update[key] = body[key]
    }

    const incomingCreatorIds: string[] | undefined = Array.isArray(
      body.creator_ids,
    )
      ? body.creator_ids.filter((v: unknown) => typeof v === 'string')
      : undefined

    if (Object.keys(update).length === 0 && !incomingCreatorIds) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase
        .from('works')
        .update(update)
        .eq('id', id)
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }

    // Sync work_creators: INSERT-then-DELETE-orphans (safer than
    // DELETE-then-INSERT). If the INSERT fails the join table stays as
    // it was. If the DELETE-orphans step fails afterwards, the table
    // simply has extra rows — never zero rows.
    if (incomingCreatorIds) {
      if (incomingCreatorIds.length === 0) {
        return NextResponse.json(
          { error: 'creator_ids must include at least one user' },
          { status: 400 },
        )
      }
      // Step 1 — INSERT the desired set with upsert semantics. Composite
      // PK (work_id, user_id) makes ignoreDuplicates safe.
      const rows = incomingCreatorIds.map((uid) => ({
        work_id: id,
        user_id: uid,
        added_by: user.id,
      }))
      const { error: insErr } = await supabase
        .from('work_creators')
        .upsert(rows, { onConflict: 'work_id,user_id', ignoreDuplicates: true })
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
      // Step 2 — fetch current rows, compute the orphan diff client-side,
      // then delete by an explicit id list (cleaner than NOT IN with raw
      // SQL fragments since UUID quoting in PostgREST filters is fiddly).
      // If this step fails we still have all the requested creators
      // present, plus some stale ones — never zero.
      const desiredSet = new Set(incomingCreatorIds)
      const { data: currentRows } = await supabase
        .from('work_creators')
        .select('user_id')
        .eq('work_id', id)
      const orphanIds = (currentRows || [])
        .map((r) => r.user_id as string)
        .filter((uid) => !desiredSet.has(uid))
      if (orphanIds.length > 0) {
        const { error: delErr } = await supabase
          .from('work_creators')
          .delete()
          .eq('work_id', id)
          .in('user_id', orphanIds)
        if (delErr) {
          return NextResponse.json(
            {
              success: true,
              warning: `Co-owners updated, but couldn't remove the old ones: ${delErr.message}`,
            },
            { status: 200 },
          )
        }
      }
    }

    // Log the edit (non-blocking)
    const { data: mem } = await supabase.from('memberships').select('full_name').eq('user_id', user.id).eq('org_id', work.org_id).maybeSingle()
    logActivity(supabase, { orgId: work.org_id, entityType: 'work', entityId: id, action: 'edited', fromValue: null, toValue: null, actorName: mem?.full_name ?? 'Unknown' })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** DELETE — archive a work (master only). */
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

    const { data: work } = await supabase
      .from('works')
      .select('id, org_id')
      .eq('id', id)
      .maybeSingle()
    if (!work) {
      return NextResponse.json({ error: 'Work not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', work.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership || (membership.role !== 'master' && membership.role !== 'manager')) {
      return NextResponse.json({ error: 'Only master/manager can delete works' }, { status: 403 })
    }

    const { error } = await supabase
      .from('works')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: mem } = await supabase.from('memberships').select('full_name').eq('user_id', user.id).eq('org_id', work.org_id).maybeSingle()
    logActivity(supabase, { orgId: work.org_id, entityType: 'work', entityId: id, action: 'archived', fromValue: null, toValue: null, actorName: mem?.full_name ?? 'Unknown' })

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
