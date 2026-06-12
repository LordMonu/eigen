'use client'

// app/app/studio/outcome-form.tsx — Phase 5 outcome capture.
//
// Collapsible panel at the bottom of each variant card. Creator records the
// real-world performance after publishing in TikTok/Reels/Shorts/etc.
//
// Lifecycle:
//   - First save → POST /api/studio/outcome; stash the returned outcome.id
//     locally so subsequent saves go PATCH instead of creating duplicate rows.
//   - Subsequent saves → PATCH /api/studio/outcome/<id>.
//   - existingOutcome (server-fetched) seeds the form on mount.
//
// `went_viral` is a creator judgment, NOT computed. Phase 6's Tier-2 scorer
// will use this as a labeled training signal.

import { useState } from 'react'
import {
  ChevronRight,
  TrendingUp,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PLATFORMS: Record<string, string> = {
  tiktok: 'TikTok',
  reels: 'Instagram Reels',
  shorts: 'YouTube Shorts',
  youtube: 'YouTube',
  instagram_feed: 'Instagram Feed',
  other: 'Other',
}

export interface Outcome {
  id: string
  platform: string | null
  published_url: string | null
  published_at: string | null
  views: number
  watch_time_avg_seconds: number | null
  shares: number
  saves: number
  comments: number
  likes: number
  went_viral: boolean
}

interface OutcomeFormProps {
  blueprintId: string
  existingOutcome: Outcome | null
}

// "" → empty string so the input renders blank instead of "null"/"undefined".
// Caller's responsibility to NOT pass undefined into Input value (React 19
// errors on switching controlled ↔ uncontrolled).
function toStr(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n)
}

export function OutcomeForm({
  blueprintId,
  existingOutcome,
}: OutcomeFormProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomeId, setOutcomeId] = useState<string | null>(
    existingOutcome?.id ?? null,
  )

  // Form state — keep numbers as STRINGS in state (input value is always a
  // string) and parse on save.
  const [platform, setPlatform] = useState(
    existingOutcome?.platform ?? 'tiktok',
  )
  const [publishedUrl, setPublishedUrl] = useState(
    existingOutcome?.published_url ?? '',
  )
  const [publishedAt, setPublishedAt] = useState(
    existingOutcome?.published_at ?? '',
  )
  const [views, setViews] = useState(toStr(existingOutcome?.views))
  const [watchTime, setWatchTime] = useState(
    toStr(existingOutcome?.watch_time_avg_seconds),
  )
  const [shares, setShares] = useState(toStr(existingOutcome?.shares))
  const [saves, setSaves] = useState(toStr(existingOutcome?.saves))
  const [comments, setComments] = useState(toStr(existingOutcome?.comments))
  const [likes, setLikes] = useState(toStr(existingOutcome?.likes))
  const [wentViral, setWentViral] = useState(
    existingOutcome?.went_viral ?? false,
  )

  async function handleSave() {
    setBusy(true)
    setError(null)
    setSaved(false)

    // parseInt('') is NaN → falsy → ` || 0` gives 0. parseFloat('') is NaN →
    // we send undefined so the route stores NULL (watch time is optional).
    const parseCount = (s: string) => {
      const n = parseInt(s, 10)
      return Number.isFinite(n) ? n : 0
    }
    const parseFloatOrUndef = (s: string) => {
      if (!s.trim()) return undefined
      const n = parseFloat(s)
      return Number.isFinite(n) ? n : undefined
    }

    const payload = {
      blueprintId,
      platform,
      publishedUrl: publishedUrl || undefined,
      publishedAt: publishedAt || undefined,
      views: parseCount(views),
      watchTimeAvgSeconds: parseFloatOrUndef(watchTime),
      shares: parseCount(shares),
      saves: parseCount(saves),
      comments: parseCount(comments),
      likes: parseCount(likes),
      wentViral,
    }

    try {
      const isUpdate = !!outcomeId
      const url = isUpdate
        ? `/api/studio/outcome/${outcomeId}`
        : '/api/studio/outcome'
      const method = isUpdate ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      // First save → keep the new id so a subsequent click PATCHes instead
      // of inserting a duplicate row.
      if (!isUpdate && data.outcome?.id) {
        setOutcomeId(data.outcome.id as string)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy
  const isRecorded = Boolean(outcomeId)

  return (
    <div className="pt-4 mt-4 border-t border-neutral-800">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors"
      >
        <ChevronRight
          className={
            open
              ? 'size-3.5 rotate-90 transition-transform shrink-0'
              : 'size-3.5 transition-transform shrink-0'
          }
        />
        <TrendingUp className="size-3.5 shrink-0" />
        <span className="uppercase tracking-wider">
          {isRecorded ? 'Performance recorded' : 'Record real performance'}
        </span>
        {isRecorded ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-lime-400 normal-case tracking-normal">
            <Check className="size-3" />
            saved
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="space-y-4 mt-3">
          <p className="text-xs text-neutral-500 leading-relaxed">
            Published this on a platform? Drop the real metrics in and Eigen
            builds its training corpus from your wins.
          </p>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="col-span-2 md:col-span-1 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Platform
              </Label>
              <Select
                value={platform}
                onValueChange={(v) => setPlatform(v as string)}
              >
                <SelectTrigger
                  size="sm"
                  disabled={disabled}
                  className="bg-neutral-900 border-neutral-800 text-neutral-300 hover:border-neutral-700"
                >
                  <SelectValue>
                    {(v: unknown) =>
                      PLATFORMS[v as string] ?? 'Platform'
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PLATFORMS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Published URL
              </Label>
              <Input
                value={publishedUrl}
                onChange={(e) => setPublishedUrl(e.target.value)}
                placeholder="https://tiktok.com/@you/video/…"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Published date
              </Label>
              <Input
                type="date"
                value={publishedAt}
                onChange={(e) => setPublishedAt(e.target.value)}
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Views
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={views}
                onChange={(e) => setViews(e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Avg watch (s)
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                value={watchTime}
                onChange={(e) => setWatchTime(e.target.value)}
                placeholder="optional"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Likes
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={likes}
                onChange={(e) => setLikes(e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Shares
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Saves
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={saves}
                onChange={(e) => setSaves(e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] uppercase tracking-wider text-neutral-500">
                Comments
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="0"
                disabled={disabled}
                className="bg-neutral-900 border-neutral-800 text-neutral-200 font-mono tabular-nums"
              />
            </div>
          </div>

          {/* Went viral toggle */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              role="switch"
              aria-checked={wentViral}
              aria-label="Mark as went viral"
              onClick={() => setWentViral((v) => !v)}
              disabled={disabled}
              className={
                wentViral
                  ? 'relative inline-flex h-5 w-9 items-center rounded-full bg-lime-400 transition-colors disabled:opacity-60'
                  : 'relative inline-flex h-5 w-9 items-center rounded-full bg-neutral-700 transition-colors disabled:opacity-60'
              }
            >
              <span
                className={
                  wentViral
                    ? 'inline-block h-3.5 w-3.5 rounded-full bg-black translate-x-4 transition-transform'
                    : 'inline-block h-3.5 w-3.5 rounded-full bg-neutral-300 translate-x-1 transition-transform'
                }
              />
            </button>
            <span className="text-xs text-neutral-300">Went viral</span>
            <span className="text-[10px] text-neutral-500">
              your call — labels Phase 6 training data
            </span>
          </div>

          {/* Error inline */}
          {error ? (
            <p className="inline-flex items-start gap-1.5 text-xs text-red-400 leading-relaxed">
              <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
              {error}
            </p>
          ) : null}

          {/* Save */}
          <div>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled}
              className={
                saved
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-lime-400 text-black transition-colors disabled:opacity-60'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-lime-400 text-black hover:bg-lime-300 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
              }
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : saved ? (
                <Check className="size-3.5" />
              ) : null}
              {busy
                ? 'Saving…'
                : saved
                  ? 'Saved'
                  : isRecorded
                    ? 'Update performance'
                    : 'Save performance'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
