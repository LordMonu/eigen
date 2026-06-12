// app/api/studio/outcome/route.ts — Phase 5: record real-world performance.
//
// POST  body { blueprintId, platform, publishedUrl?, publishedAt?, views,
//              watchTimeAvgSeconds?, shares, saves, comments, likes, wentViral }
//       → inserts one row into generation_outcomes for the creator's blueprint.
//
// Authorization mirrors score/enhance/blueprint routes:
//   - Auth required.
//   - Membership SCOPED to the BLUEPRINT'S org (not most-recent membership).
//     Without this, a multi-org user recording an outcome would write the
//     outcome under the wrong org_id, corrupting the training data partition.
//   - Soft guard: numeric fields clamped non-negative; strings length-capped.
//   - Generic error strings to the client; raw DB messages logged server-side.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Defensive caps. The form has its own validation but a hand-crafted request
// could still try to inflate a row.
const MAX_URL_LEN = 2048
const MAX_PLATFORM_LEN = 40

// Postgres BIGINT max is 9.22e18; cap below at the safe-integer ceiling so a
// runaway client can't overflow.
const MAX_COUNT = Number.MAX_SAFE_INTEGER
const MAX_WATCH_SECONDS = 999_999 // ~11.5 days — saner than NUMERIC(8,2) cap

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

interface OutcomeBody {
  blueprintId?: string
  platform?: string
  publishedUrl?: string
  publishedAt?: string
  views?: unknown
  watchTimeAvgSeconds?: unknown
  shares?: unknown
  saves?: unknown
  comments?: unknown
  likes?: unknown
  wentViral?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let body: OutcomeBody
    try {
      body = (await req.json()) as OutcomeBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const blueprintId = body.blueprintId
    if (!blueprintId) {
      return NextResponse.json(
        { error: 'blueprintId required' },
        { status: 400 },
      )
    }

    // Read blueprint FIRST so we know which org to scope membership + write
    // the outcome against. RLS scopes this; .maybeSingle() returns null when
    // the blueprint isn't in any of the user's orgs.
    const { data: blueprint, error: bpErr } = await supabase
      .from('prompt_blueprints')
      .select('id, org_id')
      .eq('id', blueprintId)
      .maybeSingle()
    if (bpErr) {
      console.error('[studio:outcome.POST] blueprint read failed:', bpErr.message)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint not found' }, { status: 404 })
    }

    // Membership scoped to the blueprint's org — covers multi-org users.
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

    // Sanitize all user input.
    const platform = body.platform
      ? String(body.platform).slice(0, MAX_PLATFORM_LEN)
      : null
    const publishedUrl = body.publishedUrl
      ? String(body.publishedUrl).slice(0, MAX_URL_LEN)
      : null
    // published_at is a DATE; pass through as YYYY-MM-DD string or null.
    // Postgres rejects malformed dates with a 22008 error, which we surface
    // as a generic 500. The form sends type="date" inputs so this is safe.
    const publishedAt = body.publishedAt ? String(body.publishedAt) : null

    const { data: outcome, error } = await supabase
      .from('generation_outcomes')
      .insert({
        org_id: blueprint.org_id,
        blueprint_id: blueprintId,
        platform,
        published_url: publishedUrl,
        published_at: publishedAt,
        views: clampInt(body.views),
        watch_time_avg_seconds: clampFloat(body.watchTimeAvgSeconds),
        shares: clampInt(body.shares),
        saves: clampInt(body.saves),
        comments: clampInt(body.comments),
        likes: clampInt(body.likes),
        went_viral: Boolean(body.wentViral),
        recorded_by: user.id,
      })
      .select(
        'id, blueprint_id, platform, published_url, published_at, views, watch_time_avg_seconds, shares, saves, comments, likes, went_viral, recorded_at, updated_at',
      )
      .single()

    if (error) {
      console.error('[studio:outcome.POST] insert failed:', error.message)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ outcome })
  } catch (err: unknown) {
    console.error('[studio:outcome.POST]', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
