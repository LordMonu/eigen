// app/api/studio/outcome/[id]/route.ts — Phase 5: update / remove an outcome.
//
// PATCH  body { platform?, publishedUrl?, publishedAt?, views?, ... }
//        → updates whitelisted fields on one generation_outcomes row.
//
// DELETE → master/manager only (RLS enforced by the policy from
//          studio-outcomes.sql; the route also returns 403 early when the
//          local role check fails so the user gets a clean message instead
//          of an RLS no-op).
//
// Auth pattern mirrors the POST route: read outcome FIRST so we can scope
// membership to the outcome's org. Without this, a multi-org user's
// most-recent-membership role might not match the org the outcome lives in.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

interface RouteContext {
  params: Promise<{ id: string }>
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Mirror the POST route's defensive caps so PATCH can't be used to bypass
// the validation that POST enforces.
const MAX_URL_LEN = 2048
const MAX_PLATFORM_LEN = 40
const MAX_COUNT = Number.MAX_SAFE_INTEGER
const MAX_WATCH_SECONDS = 999_999

function clampInt(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(Math.floor(n), MAX_COUNT)
}

function clampFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.min(n, MAX_WATCH_SECONDS)
}

// camelCase request key → snake_case DB column + per-field sanitizer.
// Anything NOT in this map is silently dropped by the route — clients can't
// write to columns like org_id, recorded_by, recorded_at.
const FIELDS: Record<string, { col: string; coerce: (v: unknown) => unknown }> = {
  platform: {
    col: 'platform',
    coerce: (v) => (v ? String(v).slice(0, MAX_PLATFORM_LEN) : null),
  },
  publishedUrl: {
    col: 'published_url',
    coerce: (v) => (v ? String(v).slice(0, MAX_URL_LEN) : null),
  },
  publishedAt: {
    col: 'published_at',
    coerce: (v) => (v ? String(v) : null),
  },
  views: { col: 'views', coerce: clampInt },
  watchTimeAvgSeconds: { col: 'watch_time_avg_seconds', coerce: clampFloat },
  shares: { col: 'shares', coerce: clampInt },
  saves: { col: 'saves', coerce: clampInt },
  comments: { col: 'comments', coerce: clampInt },
  likes: { col: 'likes', coerce: clampInt },
  wentViral: { col: 'went_viral', coerce: (v) => Boolean(v) },
}

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

    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    // Read outcome FIRST so we know the org. RLS scopes the read — foreign-org
    // outcomes come back as null, not error.
    const { data: outcome, error: readErr } = await supabase
      .from('generation_outcomes')
      .select('id, org_id, recorded_by')
      .eq('id', id)
      .maybeSingle()
    if (readErr) {
      console.error('[studio:outcome.PATCH] read failed:', readErr.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }
    if (!outcome) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 })
    }

    // Membership scoped to the outcome's org.
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', outcome.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 },
      )
    }

    // Recorder OR master/manager can update — matches the RLS policy. We
    // check explicitly so the user gets a clean 403 instead of an empty
    // update that silently does nothing.
    const isOwn = outcome.recorded_by === user.id
    const isPrivileged = ['master', 'manager'].includes(membership.role)
    if (!isOwn && !isPrivileged) {
      return NextResponse.json(
        { error: 'Only the recorder or master/manager can edit this outcome' },
        { status: 403 },
      )
    }

    // Whitelist + coerce. Anything not in FIELDS is silently dropped.
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    for (const [key, value] of Object.entries(body)) {
      const spec = FIELDS[key]
      if (!spec) continue
      updates[spec.col] = spec.coerce(value)
    }

    // updated_at is the only key besides what the user sent. If nothing
    // sanitized through, there's nothing meaningful to update.
    if (Object.keys(updates).length <= 1) {
      return NextResponse.json(
        { error: 'No updatable fields supplied' },
        { status: 400 },
      )
    }

    const { error: updateErr } = await supabase
      .from('generation_outcomes')
      .update(updates)
      .eq('id', id)
    if (updateErr) {
      console.error('[studio:outcome.PATCH] update failed:', updateErr.message)
      return NextResponse.json({ error: 'Update failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[studio:outcome.PATCH]', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}

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

    const { data: outcome, error: readErr } = await supabase
      .from('generation_outcomes')
      .select('id, org_id, recorded_by')
      .eq('id', id)
      .maybeSingle()
    if (readErr) {
      console.error('[studio:outcome.DELETE] read failed:', readErr.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }
    if (!outcome) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', outcome.org_id)
      .eq('status', 'active')
      .maybeSingle()
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 },
      )
    }

    // Outcome deletion is master/manager only. The RLS policy also enforces
    // this; the explicit check here returns a clean 403 rather than an empty
    // delete result for creators who try.
    if (!['master', 'manager'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Only master/manager can delete outcomes' },
        { status: 403 },
      )
    }

    const { error: delErr } = await supabase
      .from('generation_outcomes')
      .delete()
      .eq('id', id)
    if (delErr) {
      console.error('[studio:outcome.DELETE] delete failed:', delErr.message)
      return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[studio:outcome.DELETE]', err)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
