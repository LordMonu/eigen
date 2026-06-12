// lib/supabase-server.ts
// Server-side Supabase client for server components and route handlers.
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Supabase sits behind Cloudflare; from Node's fetch the first (cold) TCP/TLS
// connection occasionally exceeds undici's connect timeout and throws
// "TypeError: fetch failed" (UND_ERR_CONNECT_TIMEOUT). Retry thrown (network)
// errors with a small backoff. HTTP errors come back as normal responses, so
// real errors are not retried.
const fetchWithRetry: typeof fetch = async (input, init) => {
  let lastError: unknown
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
    }
  }
  throw lastError
}

export const createClient = cache(async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: fetchWithRetry },
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Components can't set cookies — middleware handles refresh.
          }
        },
      },
    }
  )
})
