// app/api/hf-assign/route.ts — assign a generation to a client (RLS scopes to org).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { generationId, clientId } = await req.json()
    if (!generationId || !clientId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // RLS ensures the user can only update generations in their org.
    const { error } = await supabase
      .from('generations')
      .update({ client_id: clientId, assigned_at: new Date().toISOString() })
      .eq('id', generationId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Assign failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
