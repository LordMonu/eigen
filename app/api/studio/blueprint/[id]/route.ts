// app/api/studio/blueprint/[id]/route.ts — Phase 4: attach-to-work + delete.
//
// PATCH  body { workId: string | null }  → updates prompt_blueprints.work_id
// DELETE                                  → deletes the row (cascades virality_scores)
//
// Authorization mirrors score/enhance routes:
//   - Auth required.
//   - Membership lookup is SCOPED TO THE BLUEPRINT'S org (not most-recent
//     approved membership). This matters in multi-org accounts: without
//     scoping, a creator in org A trying to delete a blueprint in org B would
//     pick up org A's role and either be wrongly allowed or wrongly denied.
//   - DELETE additionally checks ownership OR studio.delete (master/manager).
//   - PATCH validates the target workId belongs to the SAME org as the
//     blueprint. The DB column is a soft FK with ON DELETE SET NULL — there's
//     no constraint preventing cross-org attachment. RLS would catch the read
//     by the user, but a malicious client could still attach a blueprint to
//     a foreign work it knows the id of. Belt-and-braces.
//
// Errors are returned as a generic "..failed" string to the client. Raw
// Supabase / Postgres messages are logged server-side only.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { can, type Role } from '@/lib/rbac'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH: attach / detach a blueprint to a work.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let body: { workId?: string | null }
    try {
      body = (await req.json()) as { workId?: string | null }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    // null OR empty string OR undefined → detach
    const workId =
      body.workId && typeof body.workId === 'string' && body.workId.length > 0
        ? body.workId
        : null

    // Read blueprint FIRST so we know which org to scope membership against.
    // RLS scopes the read; .maybeSingle() returns null for foreign orgs.
    const { data: blueprint, error: bpErr } = await supabase
      .from('prompt_blueprints')
      .select('id, org_id, created_by')
      .eq('id', id)
      .maybeSingle()
    if (bpErr) {
      console.error('[studio:blueprint.PATCH] read failed:', bpErr.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    // Membership scoped to the blueprint's org. studio.edit is the right
    // permission for mutating an existing blueprint's metadata.
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', blueprint.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 },
      )
    }
    if (!can(membership.role as Role, 'studio', 'edit')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
    }

    // If a workId is provided, verify it's in the SAME org as the blueprint.
    // Soft FK only — without this check, a client could attach to a foreign
    // work whose id leaked elsewhere.
    if (workId) {
      const { data: work, error: workErr } = await supabase
        .from('works')
        .select('id, org_id')
        .eq('id', workId)
        .maybeSingle()
      if (workErr) {
        console.error('[studio:blueprint.PATCH] work read failed:', workErr.message)
        return NextResponse.json({ error: 'Update failed' }, { status: 500 })
      }
      if (!work || work.org_id !== blueprint.org_id) {
        return NextResponse.json(
          { error: 'Work does not belong to this organization' },
          { status: 400 },
        )
      }
    }

    const { error: updateErr } = await supabase
      .from('prompt_blueprints')
      .update({ work_id: workId })
      .eq('id', id)
    if (updateErr) {
      console.error('[studio:blueprint.PATCH] update failed:', updateErr.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, workId })
  } catch (err: unknown) {
    console.error('[studio:blueprint.PATCH]', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

// DELETE: remove a blueprint. Cascades virality_scores via the FK ON DELETE
// CASCADE defined in studio-scores.sql.
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: blueprint, error: bpErr } = await supabase
      .from('prompt_blueprints')
      .select('id, org_id, created_by')
      .eq('id', id)
      .maybeSingle()
    if (bpErr) {
      console.error('[studio:blueprint.DELETE] read failed:', bpErr.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', blueprint.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 },
      )
    }

    // Creators can delete their OWN blueprints; master/manager can delete any.
    const isOwn = blueprint.created_by === user.id
    const isPrivileged = can(membership.role as Role, 'studio', 'delete')
    if (!isOwn && !isPrivileged) {
      return NextResponse.json(
        { error: 'You can only delete your own variants' },
        { status: 403 },
      )
    }

    const { error: delErr } = await supabase
      .from('prompt_blueprints')
      .delete()
      .eq('id', id)
    if (delErr) {
      console.error('[studio:blueprint.DELETE] delete failed:', delErr.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[studio:blueprint.DELETE]', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
