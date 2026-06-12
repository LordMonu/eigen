'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { X, Check } from 'lucide-react'

type Role = 'master' | 'manager' | 'creator'

const ROLE_LABELS: Record<Role, string> = {
  master: 'Master',
  manager: 'Manager',
  creator: 'Creator',
}

interface HfConnection {
  id: string
  label: string
  hf_email: string | null
}

interface Invitation {
  id: string
  email: string
  role: string
  created_at: string
  used_at: string | null
  connection_ids: string[]
}

interface Props {
  orgId: string
  connections: HfConnection[]
  initialInvitations: Invitation[]
}

export function InviteUserSection({ orgId, connections, initialInvitations }: Props) {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [invitations, setInvitations] = useState<Invitation[]>(initialInvitations)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('creator')
  const [selectedConnIds, setSelectedConnIds] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [newJoiner, setNewJoiner] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Realtime watch for accepted invitations
  useEffect(() => {
    const channel = supabase
      .channel('invitations-watch')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'invitations',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const updated = payload.new as Invitation
          setInvitations(prev =>
            prev.map(i => i.id === updated.id ? { ...i, used_at: updated.used_at } : i)
          )
          if (updated.used_at && !payload.old.used_at) {
            setNewJoiner(updated.email)
            setTimeout(() => setNewJoiner(null), 6000)
            startTransition(() => {
              router.refresh()
            })
          }
        }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [supabase, orgId, router])

  function toggleConn(connId: string) {
    setSelectedConnIds(prev => {
      const next = new Set(prev)
      if (next.has(connId)) next.delete(connId)
      else next.add(connId)
      return next
    })
  }

  function selectAllConns() {
    setSelectedConnIds(new Set(connections.map(c => c.id)))
  }

  function clearConns() {
    setSelectedConnIds(new Set())
  }

  async function handleInvite() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    if (!trimmed.includes('@')) {
      setError('Please enter a valid email address')
      return
    }

    // Validate: non-master roles should have at least one HF account
    if (role !== 'master' && selectedConnIds.size === 0 && connections.length > 0) {
      setError(`Pick at least one Higgsfield account for this ${ROLE_LABELS[role]}`)
      return
    }

    setSending(true)
    setError(null)
    setSuccess(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error: e } = await supabase
        .from('invitations')
        .insert({
          org_id: orgId,
          email: trimmed,
          role,
          invited_by: user.id,
          connection_ids: Array.from(selectedConnIds),
        })
        .select('id, email, role, created_at, used_at, connection_ids')
        .single()

      if (e) {
        if (e.message.includes('duplicate') || e.message.includes('unique')) {
          throw new Error('This email has already been invited')
        }
        throw e
      }

      if (data) {
        setInvitations(prev => [{ ...data, connection_ids: data.connection_ids || [] }, ...prev])
        setEmail('')
        setSelectedConnIds(new Set())
        const accountText = selectedConnIds.size > 0
          ? ` with access to ${selectedConnIds.size} HF account${selectedConnIds.size === 1 ? '' : 's'}`
          : ''
        setSuccess(`Invited ${trimmed} as ${ROLE_LABELS[role]}${accountText}. They'll be auto-approved on signup.`)
        setTimeout(() => setSuccess(null), 6000)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to invite')
    } finally {
      setSending(false)
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id)
    try {
      const { error: e } = await supabase
        .from('invitations')
        .delete()
        .eq('id', id)
      if (e) {
        setError(e.message)
        return
      }
      setInvitations(prev => prev.filter(i => i.id !== id))
    } finally {
      setRevokingId(null)
    }
  }

  const pending = invitations.filter(i => !i.used_at)
  const used = invitations.filter(i => i.used_at)

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-800">
        <h2 className="font-semibold text-white">Invite Users</h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Pre-approve an email and pick which Higgsfield accounts they can sync from.
          They&apos;ll skip the pending queue when they sign in.
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* INVITE FORM */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 bg-neutral-900 border-neutral-700 text-white"
              onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
              disabled={sending || isPending}
            />
            <Select value={role} onValueChange={v => setRole(v as Role)}>
              <SelectTrigger className="w-28 bg-neutral-900 border-neutral-700">
                <SelectValue>
                  {(v) => {
                    const val = v as Role | null
                    return val ? ROLE_LABELS[val] : 'Role'
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="creator">Creator</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="master">Master</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* HF ACCOUNTS PICKER */}
          {connections.length > 0 && role !== 'master' && (
            <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm font-medium text-white">
                    Higgsfield Accounts Access
                  </div>
                  <div className="text-xs text-neutral-500">
                    Pick which accounts this user can sync from
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllConns}
                    className="text-xs text-lime-400 hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-neutral-700">·</span>
                  <button
                    type="button"
                    onClick={clearConns}
                    className="text-xs text-neutral-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {connections.map(conn => {
                  const checked = selectedConnIds.has(conn.id)
                  return (
                    <button
                      key={conn.id}
                      type="button"
                      onClick={() => toggleConn(conn.id)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md border transition-colors ${
                        checked
                          ? 'border-lime-800 bg-lime-950/30'
                          : 'border-neutral-800 bg-neutral-900/30 hover:border-neutral-700'
                      }`}
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
                      {checked ? (
                        <div className="size-5 rounded-full bg-lime-400 flex items-center justify-center shrink-0">
                          <Check className="size-3 text-black" />
                        </div>
                      ) : (
                        <div className="size-5 rounded-full border-2 border-neutral-600 shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {connections.length === 0 && role !== 'master' && (
            <div className="bg-yellow-950/30 border border-yellow-900 text-yellow-300 text-xs px-3 py-2 rounded">
              No Higgsfield accounts connected yet. Add one in{' '}
              <a href="/app/settings" className="text-lime-400 hover:underline">
                Settings
              </a>{' '}
              first so the invitee can sync.
            </div>
          )}

          <Button
            onClick={handleInvite}
            disabled={sending || isPending || !email.trim()}
            className="w-full bg-lime-400 text-black hover:bg-lime-300 font-semibold"
          >
            {sending ? 'Inviting…' : isPending ? 'Updating…' : 'Send Invitation'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900 text-red-300 text-sm px-3 py-2 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950/40 border border-green-900 text-green-300 text-sm px-3 py-2 rounded">
            {success}
          </div>
        )}
        {newJoiner && (
          <div className="bg-lime-950/50 border border-lime-700 text-lime-300 text-sm px-3 py-2 rounded flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span><span className="font-semibold">{newJoiner}</span> just joined the org!</span>
          </div>
        )}

        {/* PENDING INVITATIONS */}
        {pending.length > 0 && (
          <div>
            <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Pending Invitations ({pending.length})
            </h3>
            <div className="divide-y divide-neutral-800 bg-neutral-900 rounded-lg overflow-hidden">
              {pending.map(inv => {
                const grantedCount = inv.connection_ids?.length || 0
                return (
                  <div key={inv.id} className="px-3 py-2 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{inv.email}</span>
                        <span className="text-xs text-neutral-500 capitalize">
                          {inv.role}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 mt-0.5">
                        {grantedCount > 0
                          ? `${grantedCount} HF account${grantedCount === 1 ? '' : 's'} granted`
                          : inv.role === 'master'
                          ? '— master has full access'
                          : 'No HF accounts granted'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokingId === inv.id || isPending}
                      className="h-6 w-6 p-0 text-neutral-500 hover:text-red-400"
                    >
                      <X className="size-3" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* USED INVITATIONS */}
        {used.length > 0 && (
          <div>
            <h3 className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
              Accepted ({used.length})
            </h3>
            <div className="divide-y divide-neutral-800 bg-neutral-900 rounded-lg overflow-hidden">
              {used.map(inv => (
                <div key={inv.id} className="px-3 py-2 flex items-center justify-between">
                  <div>
                    <span className="text-sm text-neutral-400">{inv.email}</span>
                    <span className="text-xs text-neutral-600 ml-2 capitalize">
                      {inv.role}
                    </span>
                  </div>
                  <span className="text-xs text-green-500">Joined</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
