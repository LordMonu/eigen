// lib/sync-cooldown.ts — per-account HF sync cooldown via localStorage.
// Change SYNC_COOLDOWN_MS to adjust how long before an account can re-sync.

export const SYNC_COOLDOWN_MS = 10 * 60 * 1000 // 10 minutes

const KEY_PREFIX = 'hf-sync-'

export function isCooldownActive(connectionId: string): boolean {
  if (typeof window === 'undefined') return false
  const raw = localStorage.getItem(`${KEY_PREFIX}${connectionId}`)
  if (!raw) return false
  return Date.now() - Number(raw) < SYNC_COOLDOWN_MS
}

export function markSynced(connectionId: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(`${KEY_PREFIX}${connectionId}`, Date.now().toString())
}

export function getCooldownRemaining(connectionId: string): number {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(`${KEY_PREFIX}${connectionId}`)
  if (!raw) return 0
  const elapsed = Date.now() - Number(raw)
  return Math.max(0, SYNC_COOLDOWN_MS - elapsed)
}
