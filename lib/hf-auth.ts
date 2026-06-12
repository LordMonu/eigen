// lib/hf-auth.ts — Higgsfield OAuth (device-code) + token refresh.
// SERVER ONLY. Pure HTTPS — no CLI — so it runs identically on localhost and
// Vercel. Endpoints verified against the live backend (the same ones the
// `higgsfield` CLI uses).

const DEVICE_AUTH_BASE = 'https://fnf-device-auth.higgsfield.ai'
const UA = 'hf-cli/1.0'

// Higgsfield's first (cold) connection from Node's fetch occasionally exceeds
// undici's connect timeout — retry thrown (network) errors a few times.
async function fetchRetry(
  input: string,
  init: RequestInit,
  tries = 4
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)))
    }
  }
  throw lastError
}

export interface DeviceAuth {
  device_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface TokenSet {
  access_token: string
  refresh_token: string
  expires_in?: number
}

/** Start a device-code login. Returns the code + the URL the user opens. */
export async function startDeviceAuth(): Promise<DeviceAuth> {
  const res = await fetchRetry(`${DEVICE_AUTH_BASE}/authorize`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: '{}',
  })
  if (!res.ok) throw new Error(`Device authorize failed (${res.status})`)
  return res.json()
}

export type PollResult =
  | { status: 'pending' }
  | { status: 'done'; tokens: TokenSet }
  | { status: 'error'; message: string }

/** Poll once for the device-code token. */
export async function pollDeviceToken(deviceCode: string): Promise<PollResult> {
  const res = await fetchRetry(`${DEVICE_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ device_code: deviceCode }),
  })
  const data = await res.json().catch(() => ({}))

  // Pending (HTTP 400 + detail). Check this FIRST so a 4xx body is read correctly.
  const detail = String(data?.detail ?? '')
  if (detail === 'authorization_pending' || detail === 'slow_down') {
    return { status: 'pending' }
  }

  // Success — accept the access token wherever the backend nests it.
  const tokens = extractTokens(data)
  if (tokens) {
    return { status: 'done', tokens }
  }

  // Anything else: log the shape (keys only, never values) so we can diagnose.
  console.error(
    '[hf-auth] unexpected /token response — status:',
    res.status,
    'keys:',
    Object.keys(data || {}),
    'detail:',
    detail || '(none)'
  )
  return {
    status: 'error',
    message: detail || `Unexpected token response (HTTP ${res.status})`,
  }
}

// The device /token success body could plausibly be flat or nested; find it.
function extractTokens(data: unknown): TokenSet | null {
  if (!data || typeof data !== 'object') return null
  const candidates = [
    data as Record<string, unknown>,
    (data as Record<string, unknown>).tokens as Record<string, unknown>,
    (data as Record<string, unknown>).data as Record<string, unknown>,
    (data as Record<string, unknown>).result as Record<string, unknown>,
  ]
  for (const c of candidates) {
    if (c && typeof c === 'object' && typeof c.access_token === 'string') {
      return {
        access_token: c.access_token as string,
        refresh_token: (c.refresh_token as string) || '',
        expires_in:
          typeof c.expires_in === 'number'
            ? (c.expires_in as number)
            : undefined,
      }
    }
  }
  return null
}

/** Exchange a refresh token for a new token set. */
export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  const res = await fetchRetry(`${DEVICE_AUTH_BASE}/refresh`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(
      `Token refresh failed: ${data?.detail || res.status}`
    )
  }
  return data as TokenSet
}

/** expires_in (seconds) → absolute ISO timestamp, or null if absent. */
export function expiresAtFrom(tokens: TokenSet): string | null {
  if (!tokens.expires_in) return null
  return new Date(Date.now() + tokens.expires_in * 1000).toISOString()
}
