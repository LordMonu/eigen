// lib/auth-helpers.ts
// Server-side helpers: identity, active membership, and role guards.
import { cache } from 'react'
import { createClient } from './supabase-server'
import { redirect } from 'next/navigation'

export type Role = 'master' | 'manager' | 'creator'
export type MembershipStatus = 'pending' | 'active' | 'rejected'

export interface ActiveMembership {
  id: string
  org_id: string
  org_name: string
  role: Role
  full_name: string
  user_id: string
}

// A foreign-table select can come back as an object or a single-element array
// depending on the relationship inference; normalize to the org name.
function extractOrgName(organizations: unknown): string {
  if (Array.isArray(organizations)) {
    return organizations[0]?.name ?? 'Unknown'
  }
  if (organizations && typeof organizations === 'object' && 'name' in organizations) {
    return (organizations as { name: string }).name
  }
  return 'Unknown'
}

/** Get authenticated user or redirect to /. */
export async function requireUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')
  return user
}

/**
 * Get the user's active membership (most recent if multiple).
 * Redirects to /onboarding if none, /onboarding/pending if only pending.
 *
 * Wrapped in React's `cache()` so layout + page calling this in the same
 * request share one Supabase round trip instead of doing two.
 */
export const requireActiveMembership = cache(
  async (): Promise<ActiveMembership> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/')

  const { data: active } = await supabase
    .from('memberships')
    .select('id, org_id, role, full_name, organizations(name)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('approved_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (active) {
    return {
      id: active.id,
      org_id: active.org_id,
      org_name: extractOrgName(active.organizations),
      role: active.role as Role,
      full_name: active.full_name,
      user_id: user.id,
    }
  }

  const { data: pending } = await supabase
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (pending) redirect('/onboarding/pending')
  redirect('/onboarding')
})

/** Require a specific role or redirect to the dashboard. */
export async function requireRole(allowed: Role[]) {
  const membership = await requireActiveMembership()
  if (!allowed.includes(membership.role)) redirect('/app/dashboard')
  return membership
}
