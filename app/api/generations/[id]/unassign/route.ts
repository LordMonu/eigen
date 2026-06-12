// app/api/generations/[id]/unassign/route.ts
// Pull a generation fully back to "unassigned" — clears client_id, work_id,
// assigned_*, AND waste fields. Used both from the Assigned table (undo an
// assignment) and from the Wastage table (undo a waste so the row returns
// to the unassigned pool, not to the assigned bucket).
//
// Permission: master/manager anytime. Creator within 60s of EITHER their
// own assignment or their own waste action, whichever is more recent.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UNDO_WINDOW_MS = 60_000

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: generationId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: gen } = await supabase
      .from('generations')
      .select(
        'id, assigned_by, assigned_at, wasted_by, wasted_at, is_waste, org_id, work_id, display_name, credits',
      )
      .eq('id', generationId)
      .maybeSingle()
    if (!gen) {
      return NextResponse.json({ error: 'Generation not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role, org_id, full_name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    const isMasterOrManager =
      membership.role === 'master' || membership.role === 'manager'

    if (!isMasterOrManager) {
      // Creator: ownership + recency check. We accept the action if EITHER
      // the assignment-window OR (for wasted rows) the waste-window is open
      // for this user. The two are usually within seconds of each other.
      const now = Date.now()
      const wasteOk =
        gen.is_waste &&
        gen.wasted_by === user.id &&
        gen.wasted_at &&
        now - new Date(gen.wasted_at).getTime() <= UNDO_WINDOW_MS
      const assignOk =
        gen.assigned_by === user.id &&
        gen.assigned_at &&
        now - new Date(gen.assigned_at).getTime() <= UNDO_WINDOW_MS

      if (!wasteOk && !assignOk) {
        return NextResponse.json(
          { error: 'Unassign window expired or not your row' },
          { status: 403 }
        )
      }
    }

    const { error } = await supabase
      .from('generations')
      .update({
        client_id: null,
        work_id: null,
        assigned_at: null,
        assigned_by: null,
        is_waste: false,
        wasted_at: null,
        wasted_by: null,
      })
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (gen?.work_id && membership) {
      const genLabel = `${gen.display_name} (${parseFloat(gen.credits || '0').toFixed(2)} cr)`
      logActivity(supabase, {
        orgId: membership.org_id,
        entityType: 'work',
        entityId: gen.work_id,
        action: 'unassigned',
        fromValue: genLabel,
        toValue: null,
        actorName: membership.full_name ?? 'Unknown',
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unassign failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
