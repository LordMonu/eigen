// app/api/hf-sync/debug/route.ts — credit-matching diagnostics (read-only).
// GET /api/hf-sync/debug?connectionId=... → where do the credits go?
import { NextResponse } from 'next/server'
import { fetchHFCreditDebug } from '@/lib/hf-adapter'
import {
  forEachAccessibleConnection,
  NoHFConnectionError,
} from '@/lib/hf-connection'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const connectionId = url.searchParams.get('connectionId') || undefined

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!membership) {
      return NextResponse.json({ error: 'No active organization' }, { status: 403 })
    }
    const role = membership.role as 'master' | 'manager' | 'creator'

    const results = await forEachAccessibleConnection(
      supabase,
      membership.org_id,
      user.id,
      role,
      (token) => fetchHFCreditDebug(token),
      connectionId
    )

    return NextResponse.json({
      accounts: results.map((r) => ({
        label: r.label,
        error: r.error ?? null,
        ...(r.data ?? {}),
      })),
    })
  } catch (err) {
    if (err instanceof NoHFConnectionError) {
      return NextResponse.json({ error: 'No HF connection' }, { status: 409 })
    }
    const message = err instanceof Error ? err.message : 'Debug failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
