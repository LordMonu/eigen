'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Check, X } from 'lucide-react'

interface HfConnection {
  id: string
  label: string
  hf_email: string | null
}

interface CreatorMember {
  id: string
  user_id: string
  full_name: string
}

interface Grant {
  id: string
  connection_id: string
  user_id: string
}

interface Props {
  orgId: string
  connections: HfConnection[]
  creators: CreatorMember[]
  grants: Grant[]
}

export function AccountGrantsManager({
  orgId,
  connections,
  creators,
  grants: initialGrants,
}: Props) {
  const router = useRouter()
  const [grants, setGrants] = useState<Grant[]>(initialGrants)
  const [expandedCreator, setExpandedCreator] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function hasGrant(userId: string, connectionId: string) {
    return grants.some(
      (g) => g.user_id === userId && g.connection_id === connectionId
    )
  }

  function getGrantId(userId: string, connectionId: string) {
    return grants.find(
      (g) => g.user_id === userId && g.connection_id === connectionId
    )?.id
  }

  function grantCountFor(userId: string) {
    return grants.filter((g) => g.user_id === userId).length
  }

  async function toggleGrant(userId: string, connectionId: string) {
    const key = `${userId}-${connectionId}`
    setBusy(key)
    setError(null)
    const supabase = createClient()

    const existing = getGrantId(userId, connectionId)
    if (existing) {
      const { error: err } = await supabase
        .from('hf_connection_grants')
        .delete()
        .eq('id', existing)
      if (err) {
        setError(err.message)
        setBusy(null)
        return
      }
      setGrants((prev) => prev.filter((g) => g.id !== existing))
    } else {
      const { data, error: err } = await supabase
        .from('hf_connection_grants')
        .insert({ org_id: orgId, connection_id: connectionId, user_id: userId })
        .select('id, connection_id, user_id')
        .single()
      if (err) {
        setError(err.message)
        setBusy(null)
        return
      }
      if (data) setGrants((prev) => [...prev, data])
    }
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function grantAll(userId: string) {
    setBusy(`all-${userId}`)
    setError(null)
    const supabase = createClient()
    const missing = connections.filter((c) => !hasGrant(userId, c.id))
    if (missing.length === 0) {
      setBusy(null)
      return
    }
    const rows = missing.map((c) => ({
      org_id: orgId,
      connection_id: c.id,
      user_id: userId,
    }))
    const { data, error: err } = await supabase
      .from('hf_connection_grants')
      .insert(rows)
      .select('id, connection_id, user_id')
    if (err) {
      setError(err.message)
      setBusy(null)
      return
    }
    if (data) setGrants((prev) => [...prev, ...data])
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  async function revokeAll(userId: string) {
    setBusy(`all-${userId}`)
    setError(null)
    const supabase = createClient()
    const userGrants = grants.filter((g) => g.user_id === userId)
    if (userGrants.length === 0) {
      setBusy(null)
      return
    }
    const { error: err } = await supabase
      .from('hf_connection_grants')
      .delete()
      .in(
        'id',
        userGrants.map((g) => g.id)
      )
    if (err) {
      setError(err.message)
      setBusy(null)
      return
    }
    setGrants((prev) => prev.filter((g) => g.user_id !== userId))
    setBusy(null)
    startTransition(() => {
      router.refresh()
    })
  }

  if (connections.length === 0) {
    return (
      <div className="p-6 text-center text-neutral-500 text-sm">
        No Higgsfield accounts connected. Add one in{' '}
        <span className="text-lime-400">Settings</span> first.
      </div>
    )
  }

  if (creators.length === 0) {
    return (
      <div className="p-6 text-center text-neutral-500 text-sm space-y-1">
        <p>No creators in the organization yet.</p>
        <p className="text-xs">
          Set someone&apos;s role to <span className="text-lime-400">Creator</span>{' '}
          in the Active Members list above to grant them HF accounts here.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="divide-y divide-neutral-800">
        {creators.map((creator) => {
          const isExpanded = expandedCreator === creator.user_id
          const count = grantCountFor(creator.user_id)
          return (
            <div key={creator.user_id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedCreator(isExpanded ? null : creator.user_id)
                }
                className="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-neutral-900/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-neutral-500" />
                  ) : (
                    <ChevronRight className="size-4 text-neutral-500" />
                  )}
                  <span className="font-medium text-white">
                    {creator.full_name}
                  </span>
                </div>
                <span className="text-xs text-neutral-500">
                  {count} / {connections.length} account
                  {connections.length !== 1 ? 's' : ''}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 pl-11 space-y-2">
                  <div className="flex gap-2 mb-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={
                        busy !== null ||
                        isPending ||
                        count === connections.length
                      }
                      onClick={() => grantAll(creator.user_id)}
                    >
                      {busy === `all-${creator.user_id}`
                        ? 'Granting…'
                        : isPending
                          ? 'Updating…'
                          : 'Grant all'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-400 border-red-900 hover:bg-red-950"
                      disabled={busy !== null || isPending || count === 0}
                      onClick={() => revokeAll(creator.user_id)}
                    >
                      {busy === `all-${creator.user_id}`
                        ? 'Revoking…'
                        : isPending
                          ? 'Updating…'
                          : 'Revoke all'}
                    </Button>
                  </div>

                  {connections.map((conn) => {
                    const granted = hasGrant(creator.user_id, conn.id)
                    const key = `${creator.user_id}-${conn.id}`
                    const isBusy = busy === key || busy === `all-${creator.user_id}`
                    const isDisabled = busy !== null || isPending
                    return (
                      <button
                        key={conn.id}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => toggleGrant(creator.user_id, conn.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors ${
                          granted
                            ? 'border-lime-800 bg-lime-950/30'
                            : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                        } ${isBusy || (isPending && !isBusy) ? 'opacity-50' : ''}`}
                      >
                        <div className="min-w-0 text-left">
                          <div className="text-sm font-medium text-white truncate">
                            {conn.label}
                          </div>
                          {conn.hf_email && (
                            <div className="text-xs text-neutral-500 truncate">
                              {conn.hf_email}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          {granted ? (
                            <div className="size-6 rounded-full bg-lime-400 flex items-center justify-center">
                              <Check className="size-3.5 text-black" />
                            </div>
                          ) : (
                            <div className="size-6 rounded-full border-2 border-neutral-600 flex items-center justify-center">
                              <X className="size-3 text-neutral-600" />
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {error && (
        <div className="px-4 py-2 text-sm text-red-400 border-t border-neutral-800">
          {error}
        </div>
      )}
    </div>
  )
}
