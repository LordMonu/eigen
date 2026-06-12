// app/api/hf/connect/import-cli/route.ts — import the locally logged-in CLI
// account as a connection. Convenience for local dev; on a server with no CLI
// credentials file (e.g. Vercel) it returns a friendly "not found". Master only.
import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import { createClient } from '@/lib/supabase-server'
import { encrypt } from '@/lib/hf-crypto'
import { fetchHFBalance } from '@/lib/hf-adapter'

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

    const credPath =
      process.env.HIGGSFIELD_CREDENTIALS_PATH ||
      path.join(os.homedir(), '.config', 'higgsfield', 'credentials.json')

    let creds: { access_token?: string; refresh_token?: string }
    try {
      creds = JSON.parse(readFileSync(credPath, 'utf8'))
    } catch {
      return NextResponse.json(
        {
          error:
            'No local Higgsfield CLI login found on this server. Use "Start Higgsfield login" instead.',
        },
        { status: 404 }
      )
    }
    if (!creds.access_token || !creds.refresh_token) {
      return NextResponse.json(
        { error: 'CLI credentials file is missing tokens' },
        { status: 400 }
      )
    }

    let email: string | null = null
    try {
      email = (await fetchHFBalance(creds.access_token)).email
    } catch {
      /* non-fatal */
    }

    const { error: insertError } = await supabase.from('hf_connections').insert({
      org_id: membership.org_id,
      label: email ? `${email} (CLI)` : 'CLI account',
      hf_email: email,
      access_token_enc: encrypt(creds.access_token),
      refresh_token_enc: encrypt(creds.refresh_token),
      expires_at: null,
      is_active: true,
      created_by: user.id,
    })
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ status: 'done', email })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
