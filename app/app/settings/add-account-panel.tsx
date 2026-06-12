'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Copy, Check } from 'lucide-react'

type Step = 'idle' | 'starting' | 'waiting' | 'error'

// Inline (non-modal) "add Higgsfield account" flow. Expands below the button.
// The login link is shown as a copyable URL — the master copies it into a new
// tab manually (no auto-window.open). Polling auto-detects completion.
export function AddAccountPanel({
  onDone,
  onCancel,
}: {
  onDone: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState<Step>('idle')
  const [label, setLabel] = useState('')
  const [verificationUri, setVerificationUri] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelled = useRef(false)

  // Re-arm on setup AND stop polling on unmount. The setup reset is required
  // because React Strict Mode (dev) runs setup→cleanup→setup on mount; without
  // it, cancelled.current stays true and the poll loop never fetches.
  useEffect(() => {
    cancelled.current = false
    return () => {
      cancelled.current = true
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function schedulePoll(deviceCode: string, intervalSec: number) {
    timer.current = setTimeout(async () => {
      if (cancelled.current) return
      try {
        const res = await fetch('/api/hf/connect/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode, label: label.trim() }),
        })
        const d = await res.json()
        if (cancelled.current) return
        if (d.status === 'done') {
          onDone()
          return
        }
        if (d.status === 'error') {
          setError(d.error || 'Login failed')
          setStep('error')
          return
        }
        schedulePoll(deviceCode, intervalSec) // pending → keep polling
      } catch {
        if (!cancelled.current) schedulePoll(deviceCode, intervalSec)
      }
    }, intervalSec * 1000)
  }

  async function handleStart() {
    setError(null)
    setStep('starting')
    try {
      const res = await fetch('/api/hf/connect/start', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error || 'Failed to start login')
        setStep('error')
        return
      }
      setVerificationUri(d.verification_uri)
      setStep('waiting')
      schedulePoll(d.device_code, d.interval || 3)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login')
      setStep('error')
    }
  }

  async function handleCopy() {
    if (!verificationUri) return
    try {
      await navigator.clipboard.writeText(verificationUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the input so user can copy manually
      const el = document.getElementById('hf-verification-uri') as HTMLInputElement | null
      el?.select()
    }
  }

  return (
    <div className="border-t border-neutral-800 bg-neutral-900/40 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">
          Connect a Higgsfield account
        </h3>
        <button
          onClick={onCancel}
          className="text-xs text-neutral-500 hover:text-white"
        >
          Cancel
        </button>
      </div>

      {(step === 'idle' || step === 'starting') && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="hf-label" className="text-neutral-300 text-xs">
              Label (optional)
            </Label>
            <Input
              id="hf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Main account, Client X account"
              className="mt-1 bg-neutral-900 border-neutral-700 text-white"
              disabled={step === 'starting'}
            />
          </div>
          <p className="text-xs text-neutral-500">
            Click the button below to generate a Higgsfield login link. Copy
            the link and paste it into a new browser tab as the account you
            want to connect — this panel auto-finishes once you approve.
          </p>
          <Button
            onClick={handleStart}
            disabled={step === 'starting'}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            {step === 'starting' ? 'Starting…' : 'Start Higgsfield login'}
          </Button>
        </div>
      )}

      {step === 'waiting' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-lime-300">
            <span className="inline-block size-2 rounded-full bg-lime-400 animate-pulse" />
            Waiting for you to approve…
          </div>

          <div>
            <Label className="text-neutral-300 text-xs">
              Higgsfield login link
            </Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="hf-verification-uri"
                value={verificationUri}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 bg-neutral-900 border-neutral-700 text-white font-mono text-xs"
              />
              <Button
                type="button"
                onClick={handleCopy}
                variant="outline"
                className="shrink-0 border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                title="Copy link"
              >
                {copied ? (
                  <>
                    <Check className="size-4 mr-1 text-lime-400" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="size-4 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Open a new browser tab, paste the link above, and sign in as the
              Higgsfield account you want to connect. We&apos;ll detect the
              approval automatically — no need to come back here manually.
            </p>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="space-y-3">
          <div className="bg-red-950/50 border border-red-800 text-red-300 px-3 py-2 rounded text-sm">
            {error}
          </div>
          <Button
            onClick={handleStart}
            className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
          >
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}
