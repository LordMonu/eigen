// app/auth/callback/route.ts — handles the OAuth redirect Google → Supabase → here.
import { createClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // After exchange, redirect to root. The root page routes by membership.
  return NextResponse.redirect(`${origin}/`)
}
