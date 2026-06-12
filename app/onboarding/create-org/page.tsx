'use client'

// app/onboarding/create-org/page.tsx
// Real-time org-name availability check (debounced) so the user can't even
// submit a name that's already taken. The DB has a UNIQUE constraint on
// organizations.name so the RPC would 23505 anyway — this is a friendlier UX.

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Check, X as XIcon, Loader2 } from 'lucide-react'

type Availability = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

export default function CreateOrgPage() {
  const router = useRouter()
  const [supabase] = useState(() => createClient())
  const [orgName, setOrgName] = useState('')
  const [fullName, setFullName] = useState('')
  const [availability, setAvailability] = useState<Availability>('idle')
  const [takenName, setTakenName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Debounced availability check.
  useEffect(() => {
    const trimmed = orgName.trim()
    if (!trimmed) {
      setAvailability('idle')
      setTakenName(null)
      return
    }
    if (trimmed.length < 2) {
      setAvailability('invalid')
      return
    }
    setAvailability('checking')
    const handle = setTimeout(async () => {
      // Case-insensitive exact match — orgs.name has a citext or unique
      // constraint at the DB; we still use ilike for safety.
      const { data } = await supabase
        .from('organizations')
        .select('name')
        .ilike('name', trimmed)
        .limit(1)
        .maybeSingle()
      if (data) {
        setAvailability('taken')
        setTakenName(data.name)
      } else {
        setAvailability('available')
        setTakenName(null)
      }
    }, 350)
    return () => clearTimeout(handle)
  }, [orgName, supabase])

  async function handleCreate() {
    if (!orgName.trim() || !fullName.trim()) {
      setError('Both fields are required')
      return
    }
    if (availability !== 'available') {
      setError(
        availability === 'taken'
          ? 'That organization name is already taken'
          : availability === 'invalid'
            ? 'Name must be at least 2 characters'
            : 'Please wait — checking name availability…',
      )
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { error: rpcErr } = await supabase.rpc('create_org_with_master', {
        org_name: orgName.trim(),
        user_full_name: fullName.trim(),
      })
      if (rpcErr) throw rpcErr
      startTransition(() => {
        router.push('/app/dashboard')
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(
        message.includes('unique')
          ? 'An org with that name was just created by someone else — try a different name'
          : message,
      )
      setSubmitting(false)
    }
  }

  const disabled = submitting || isPending
  const canCreate =
    availability === 'available' && fullName.trim().length > 0 && !disabled

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full space-y-6 bg-neutral-950 border border-neutral-800 rounded-lg p-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Create Your Organization
          </h1>
          <p className="text-neutral-400 text-sm mt-1">
            You&apos;ll become the master admin. Org names must be unique.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="orgName" className="text-neutral-300">
              Organization name
            </Label>
            <div className="relative mt-1">
              <Input
                id="orgName"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g. Palnesto Studio"
                className="bg-neutral-900 border-neutral-700 text-white pr-9"
                disabled={disabled}
                autoFocus
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                {availability === 'checking' && (
                  <Loader2 className="size-4 text-neutral-500 animate-spin" />
                )}
                {availability === 'available' && (
                  <Check className="size-4 text-lime-400" />
                )}
                {availability === 'taken' && (
                  <XIcon className="size-4 text-red-400" />
                )}
              </div>
            </div>
            {/* Status line */}
            <p className="mt-1 text-xs h-4">
              {availability === 'idle' && (
                <span className="text-neutral-600">
                  We check the name in real time as you type.
                </span>
              )}
              {availability === 'invalid' && (
                <span className="text-neutral-500">
                  Name must be at least 2 characters.
                </span>
              )}
              {availability === 'checking' && (
                <span className="text-neutral-500">
                  Checking availability…
                </span>
              )}
              {availability === 'available' && (
                <span className="text-lime-400">
                  ✓ &ldquo;{orgName.trim()}&rdquo; is available.
                </span>
              )}
              {availability === 'taken' && (
                <span className="text-red-400">
                  &ldquo;{takenName || orgName.trim()}&rdquo; is already taken.
                  Try another name or{' '}
                  <button
                    type="button"
                    onClick={() => router.push('/onboarding/join-org')}
                    className="text-lime-400 hover:underline"
                  >
                    join the existing one
                  </button>
                  .
                </span>
              )}
            </p>
          </div>
          <div>
            <Label htmlFor="fullName" className="text-neutral-300">
              Your name
            </Label>
            <Input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Abhishek"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              disabled={disabled}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push('/onboarding')}
            disabled={disabled}
            className="flex-1"
          >
            Back
          </Button>
          <Button
            onClick={handleCreate}
            disabled={!canCreate}
            className="flex-1 bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {submitting
              ? 'Creating…'
              : isPending
                ? 'Going…'
                : 'Create Organization'}
          </Button>
        </div>
      </div>
    </div>
  )
}
