// app/api/generations/[id]/waste/route.ts — mark/unmark a generation as waste.
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
    const { id: generationId } = await params
    const { is_waste } = (await req.json()) as { is_waste: boolean }
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Any active member can mark as waste. Un-waste rules:
    //   - master            : anytime
    //   - manager           : anytime
    //   - creator (waster)  : only within 60s of their own waste action
    //   - creator (other)   : never
    const { data: membership } = await supabase
      .from('memberships')
      .select('role, org_id, full_name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 })
    }

    // Fetch generation for permission check and logging
    const { data: genFull } = await supabase
      .from('generations')
      .select('wasted_by, wasted_at, work_id, display_name, credits')
      .eq('id', generationId)
      .maybeSingle()

    if (!is_waste && membership.role === 'creator') {
      // Creator un-waste: must be the waster AND within the 60s window.
      const gen = genFull
      if (!gen) {
        return NextResponse.json(
          { error: 'Generation not found' },
          { status: 404 }
        )
      }
      if (gen.wasted_by !== user.id) {
        return NextResponse.json(
          { error: 'You did not mark this as waste' },
          { status: 403 }
        )
      }
      if (gen.wasted_at) {
        const elapsed = Date.now() - new Date(gen.wasted_at).getTime()
        if (elapsed > 60000) {
          return NextResponse.json(
            { error: 'Mark-useful window expired (60 seconds)' },
            { status: 403 }
          )
        }
      }
    }

    const updateData = is_waste
      ? {
          is_waste: true,
          wasted_at: new Date().toISOString(),
          wasted_by: user.id,
        }
      : {
          is_waste: false,
          wasted_at: null,
          wasted_by: null,
        }

    const { error } = await supabase
      .from('generations')
      .update(updateData)
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (genFull?.work_id) {
      const genLabel = `${genFull.display_name} (${parseFloat(genFull.credits || '0').toFixed(2)} cr)`
      // Detect rework+wastage: fetch work status to label it correctly
      let action: 'wastage' | 'unwastage' = is_waste ? 'wastage' : 'unwastage'
      let toValue: string | null = null
      if (is_waste) {
        const { data: work } = await supabase.from('works').select('status').eq('id', genFull.work_id).maybeSingle()
        toValue = work?.status === 'rework' ? 'rework wastage' : 'wastage'
      }
      logActivity(supabase, {
        orgId: membership.org_id,
        entityType: 'work',
        entityId: genFull.work_id,
        action,
        fromValue: genLabel,
        toValue,
        actorName: membership.full_name ?? 'Unknown',
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Waste toggle failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
