// lib/hf-connection.ts — server-side: iterate over the HF connections the
// CURRENT USER is allowed to use, transparently refreshing tokens on 401.
// SERVER ONLY.
//
// Access rules (mirrored in DB RLS):
//   - master / manager → every connection in the org
//   - creator         → only connections granted via hf_connection_grants
//
// A connection is "enabled for sync" iff is_active = true. (Master/manager
// can leave a connection disabled to keep it idle without revoking creator
// grants.)
import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './hf-crypto'
import { refreshTokens, expiresAtFrom } from './hf-auth'
import { HFUnauthorizedError } from './hf-adapter'

export class NoHFConnectionError extends Error {
  constructor() {
    super('No Higgsfield account available for your role')
    this.name = 'NoHFConnectionError'
  }
}

interface ConnRow {
  id: string
  label: string
  hf_email: string | null
  access_token_enc: string
  refresh_token_enc: string
}

/** Resolve the connection rows the current user can sync, in stable order. */
async function listAccessibleConnections(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  role: 'master' | 'manager' | 'creator'
): Promise<ConnRow[]> {
  if (role === 'master' || role === 'manager') {
    const { data } = await supabase
      .from('hf_connections')
      .select('id, label, hf_email, access_token_enc, refresh_token_enc')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    return (data as ConnRow[]) || []
  }

  // Creator: intersect enabled connections with the grants on this user.
  const { data: grants } = await supabase
    .from('hf_connection_grants')
    .select('connection_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
  const grantedIds = (grants || []).map((g) => g.connection_id)
  if (grantedIds.length === 0) return []
  const { data } = await supabase
    .from('hf_connections')
    .select('id, label, hf_email, access_token_enc, refresh_token_enc')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .in('id', grantedIds)
    .order('created_at', { ascending: true })
  return (data as ConnRow[]) || []
}

/**
 * Call `fn(token)` for ONE specific connection, refreshing + persisting the
 * rotated tokens via the SECURITY DEFINER rpc on a 401 and retrying once.
 */
async function callWithRefresh<T>(
  supabase: SupabaseClient,
  conn: ConnRow,
  fn: (accessToken: string, conn: { id: string; label: string }) => Promise<T>
): Promise<T> {
  const meta = { id: conn.id, label: conn.label }
  try {
    return await fn(decrypt(conn.access_token_enc), meta)
  } catch (err) {
    if (!(err instanceof HFUnauthorizedError)) throw err
    const tokens = await refreshTokens(decrypt(conn.refresh_token_enc))
    await supabase.rpc('hf_rotate_tokens', {
      p_id: conn.id,
      p_access_enc: encrypt(tokens.access_token),
      p_refresh_enc: encrypt(tokens.refresh_token),
      p_expires_at: expiresAtFrom(tokens),
    })
    return await fn(tokens.access_token, meta)
  }
}

export interface ConnectionResult<T> {
  connectionId: string
  label: string
  hf_email: string | null
  data: T | null
  error?: string
}

/**
 * Run `fn` once per accessible connection and tag every result with its
 * connection_id so callers can attribute records to the source account.
 * Throws NoHFConnectionError if the user has no accessible connections.
 */
export async function forEachAccessibleConnection<T>(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  role: 'master' | 'manager' | 'creator',
  fn: (accessToken: string, conn: { id: string; label: string }) => Promise<T>,
  connectionId?: string
): Promise<ConnectionResult<T>[]> {
  let conns = await listAccessibleConnections(supabase, orgId, userId, role)
  if (conns.length === 0) throw new NoHFConnectionError()
  if (connectionId) {
    conns = conns.filter((c) => c.id === connectionId)
    if (conns.length === 0) throw new NoHFConnectionError()
  }

  return Promise.all(
    conns.map(async (c): Promise<ConnectionResult<T>> => {
      try {
        const data = await callWithRefresh(supabase, c, fn)
        return { connectionId: c.id, label: c.label, hf_email: c.hf_email, data }
      } catch (err) {
        return {
          connectionId: c.id,
          label: c.label,
          hf_email: c.hf_email,
          data: null,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })
  )
}
