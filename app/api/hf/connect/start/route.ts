// app/api/hf/connect/start/route.ts — master starts a Higgsfield device login.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { startDeviceAuth } from '@/lib/hf-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Master only.
    const { data: membership } = await supabase
      .from('memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!membership || membership.role !== 'master') {
      return NextResponse.json({ error: 'Master only' }, { status: 403 })
    }

    const device = await startDeviceAuth()
    // device_code is returned to the client only to drive polling; it's a
    // short-lived, single-use authorization handle (not a credential).
    return NextResponse.json({
      device_code: device.device_code,
      verification_uri: device.verification_uri,
      interval: device.interval,
      expires_in: device.expires_in,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start login'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
