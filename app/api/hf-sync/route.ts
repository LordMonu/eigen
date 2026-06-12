// app/api/hf-sync/route.ts — sync from every HF account the caller can use.
// Master/manager: every enabled org connection. Creator: only granted ones.
// Each generation row is stamped with its source hf_connection_id so RLS
// can filter creator visibility per-account automatically.
import { NextResponse } from 'next/server'
import { fetchHFGenerations, type Generation } from '@/lib/hf-adapter'
import {
  forEachAccessibleConnection,
  NoHFConnectionError,
} from '@/lib/hf-connection'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const connectionId: string | undefined = body.connectionId || undefined

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
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 403 }
      )
    }
    const role = membership.role as 'master' | 'manager' | 'creator'

    const results = await forEachAccessibleConnection<Generation[]>(
      supabase,
      membership.org_id,
      user.id,
      role,
      (token) => fetchHFGenerations(token),
      connectionId
    )

    const rows = results.flatMap((r) =>
      (r.data || []).map((g) => ({
        org_id: membership.org_id,
        hf_connection_id: r.connectionId,
        hf_connection_label: r.label,
        external_id: g.externalId,
        display_name: g.displayName,
        job_set_type: g.jobSetType,
        result_url: g.resultUrl,
        media_type: g.mediaType,
        prompt: g.prompt,
        credits: g.credits,
        hf_created_at: g.createdAt,
        synced_at: new Date().toISOString(),
      }))
    )

    const accountErrors = results
      .filter((r) => r.error)
      .map((r) => `${r.label}: ${r.error}`)

    if (rows.length === 0) {
      return NextResponse.json({
        synced: 0,
        accounts: results.length,
        message:
          accountErrors.length > 0
            ? `Sync failed: ${accountErrors.join('; ')}`
            : 'No generations found',
        errors: accountErrors,
      })
    }

    const { error } = await supabase
      .from('generations')
      .upsert(rows, {
        onConflict: 'org_id,external_id',
        ignoreDuplicates: false,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({
      synced: rows.length,
      accounts: results.length,
      message:
        `Synced ${rows.length} generations from ${results.length} account${results.length === 1 ? '' : 's'}` +
        (accountErrors.length > 0
          ? ` (errors: ${accountErrors.join('; ')})`
          : ''),
      errors: accountErrors,
    })
  } catch (err) {
    if (err instanceof NoHFConnectionError) {
      return NextResponse.json(
        {
          error:
            'No Higgsfield account available for your role. ' +
            'Master can add one in Settings, then grant access to creators in Users.',
        },
        { status: 409 }
      )
    }
    console.error('Sync error:', err)
    let message = err instanceof Error ? err.message : 'Sync failed'
    const cause = (err as { cause?: { code?: string } })?.cause?.code
    if (cause) message += ` (${cause})`
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
