// app/api/hf/connect/poll/route.ts — poll a device login; on success store the
// (encrypted) connection. Master only.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { pollDeviceToken, expiresAtFrom } from '@/lib/hf-auth'
import { encrypt } from '@/lib/hf-crypto'
import { fetchHFBalance } from '@/lib/hf-adapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { deviceCode, label } = await req.json()
    if (!deviceCode) {
      return NextResponse.json({ error: 'Missing deviceCode' }, { status: 400 })
    }

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
    if (!membership || membership.role !== 'master') {
      return NextResponse.json({ error: 'Master only' }, { status: 403 })
    }

    const result = await pollDeviceToken(deviceCode)
    if (result.status === 'pending') {
      return NextResponse.json({ status: 'pending' })
    }
    if (result.status === 'error') {
      console.error('[hf-connect-poll] device token error:', result.message)
      return NextResponse.json({ status: 'error', error: result.message })
    }
    console.log('[hf-connect-poll] device approved, storing connection…')

    // Success — identify the account, then store encrypted.
    const { tokens } = result
    let email: string | null = null
    try {
      email = (await fetchHFBalance(tokens.access_token)).email
    } catch {
      // non-fatal; label still works without the email
    }

    const { error: insertError } = await supabase.from('hf_connections').insert({
      org_id: membership.org_id,
      label: (label && String(label).trim()) || email || 'Higgsfield account',
      hf_email: email,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: encrypt(tokens.refresh_token),
      expires_at: expiresAtFrom(tokens),
      // Multi-account: new connections are enabled by default; master can
      // disable from Settings if they want it idle.
      is_active: true,
      created_by: user.id,
    })
    if (insertError) {
      console.error('[hf-connect-poll] insert failed:', insertError)
      return NextResponse.json(
        { status: 'error', error: insertError.message },
        { status: 500 }
      )
    }

    console.log('[hf-connect-poll] connection stored for', email || '(no email)')
    return NextResponse.json({ status: 'done', email })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Poll failed'
    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
