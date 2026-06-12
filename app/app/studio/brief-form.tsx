'use client'

// app/app/studio/brief-form.tsx — Studio input.
// Single unified container (no nested boxes). Big brief textarea up top, then
// pill-style segmented controls and chip groups underneath. Generate is a
// large lime pill at the bottom right.
//
// PHASE 1 PATCH — Creative direction panel:
//   The form gained an OPTIONAL "Creative direction" disclosure below the
//   core controls. Every field inside is optional — leave blank and the
//   architect decides; set a value and it becomes a HARD constraint the
//   architect must respect. The panel uses pill-style Selects + ghost
//   textareas/inputs to stay consistent with the rest of the form (no
//   boxy nested cards). A "N set" badge next to the disclosure shows
//   how many constraints are active even when collapsed.
//
//   Sentinel for "AI decides" in selects is '__ai' (matching the existing
//   '__none' style for workId — base-ui rejects empty-string item values).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Video, ImageIcon, ChevronDown, ChevronRight } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

type MediaType = 'video' | 'image'

// base-ui Select can't take an empty-string item value; sentinels for
// "no work" and "AI decides" respectively.
const NONE_WORK = '__none'
const AI_DECIDES = '__ai'

const PLATFORMS: Array<{ id: string; label: string }> = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Reels' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'instagram_feed', label: 'IG Feed' },
  { id: 'other', label: 'Other' },
]
const VIDEO_MODELS = ['Kling 3.0', 'Kling 2.6', 'Seedance 2.0', 'Veo 3.1', 'Veo 3.1 Lite']
const IMAGE_MODELS = ['Nano Banana Pro', 'Nano Banana 2', 'Seedream', 'GPT Image']

// Constraint option lists. Curated, not exhaustive — the architect handles
// values it hasn't seen before; these just steer common picks.
const VIDEO_TONALITIES = [
  'comedic', 'deadpan', 'dramatic', 'ironic', 'sincere',
  'unhinged', 'inspirational', 'dark humor', 'suspenseful', 'wholesome',
]
const VIDEO_PACING = ['rapid-cut', 'front-loaded', 'slow-build', 'rhythmic', 'single-take']
const HOOK_STYLES = [
  'question', 'controversy', 'pattern-interrupt', 'product-reveal',
  'POV', 'challenge', 'before-after', 'text-on-screen', 'silent-open',
]
const IMAGE_MOODS = [
  'aspirational', 'playful', 'premium', 'dark', 'minimal',
  'bold', 'editorial', 'raw', 'warm', 'cold',
]
const IMAGE_STYLES = [
  'photoreal', '3D render', 'editorial', 'illustration',
  'cinematic', 'flat design', 'collage', 'typographic',
]
const DURATIONS = ['7', '15', '30', '60']
const ASPECT_RATIOS_VIDEO = ['9:16', '16:9', '1:1']
const ASPECT_RATIOS_IMAGE = ['9:16', '16:9', '1:1', '4:5']
const VARIANT_COUNTS = ['2', '3']
const LANGUAGES = [
  'English (India)', 'English (US)', 'English (UK)',
  'Hindi', 'Telugu', 'Tamil', 'Marathi', 'Kannada', 'Other',
]

interface WorkOption { id: string; label: string }

// Tiny helper to keep the pill-Select trigger styling out of the JSX body.
const PILL_TRIGGER_CLS =
  'h-7 bg-neutral-900 border-neutral-800 text-xs rounded-full px-3 gap-1.5 hover:border-neutral-700 text-neutral-200'

// The "AI decides" select pattern, hoisted to module scope (the
// react-hooks/static-components rule forbids defining components inside
// another component — every parent render would create a new identity and
// remount the subtree).
function AiSelect({
  value,
  onChange,
  options,
  formatLabel,
  placeholder = 'AI decides',
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  formatLabel?: (v: string) => string
  placeholder?: string
  disabled: boolean
}) {
  const selected = value || AI_DECIDES
  return (
    <Select
      value={selected}
      onValueChange={(v) =>
        onChange((v as string) === AI_DECIDES ? '' : (v as string))
      }
    >
      <SelectTrigger size="sm" disabled={disabled} className={PILL_TRIGGER_CLS}>
        <SelectValue>
          {(v: unknown) => {
            const val = (v as string) ?? AI_DECIDES
            if (val === AI_DECIDES) return <span className="text-neutral-500">{placeholder}</span>
            return formatLabel ? formatLabel(val) : val
          }}
        </SelectValue>
        <ChevronDown className="size-3 text-neutral-500" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={AI_DECIDES}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {formatLabel ? formatLabel(o) : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Ghost textarea — borderless, underlined, matches the audience input.
function GhostTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  rows?: number
  disabled: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      rows={rows}
      className="w-full bg-transparent border-0 border-b border-neutral-800 focus:border-lime-400 outline-none resize-none text-sm text-white placeholder:text-neutral-600 py-1.5 transition-colors"
    />
  )
}

// Ghost input — same treatment as audience field.
function GhostInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-transparent border-0 border-b border-neutral-800 focus:border-lime-400 outline-none text-sm text-white placeholder:text-neutral-600 py-1 transition-colors"
    />
  )
}

export function BriefForm({ works }: { works: WorkOption[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  // ── Core (always visible) ────────────────────────────────────────────
  const [brief, setBrief] = useState('')
  const [mediaType, setMediaType] = useState<MediaType>('video')
  const [platform, setPlatform] = useState('tiktok')
  const [variantCount, setVariantCount] = useState('2')
  const [audience, setAudience] = useState('')
  const [targetModel, setTargetModel] = useState('')
  const [workId, setWorkId] = useState(NONE_WORK)

  // ── Creative direction (advanced, all optional) ──────────────────────
  const [tonality, setTonality] = useState('')
  const [pacing, setPacing] = useState('')
  const [hookStyle, setHookStyle] = useState('')
  const [imageStyle, setImageStyle] = useState('')
  const [mood, setMood] = useState('')
  const [duration, setDuration] = useState('')
  const [aspectRatio, setAspectRatio] = useState('')
  const [scriptDirection, setScriptDirection] = useState('')
  const [textOverlayIntent, setTextOverlayIntent] = useState('')
  const [referenceSubjects, setReferenceSubjects] = useState('')
  const [trendReference, setTrendReference] = useState('')
  const [brandContext, setBrandContext] = useState('')
  const [avoidList, setAvoidList] = useState('')
  const [language, setLanguage] = useState('')

  const models = mediaType === 'video' ? VIDEO_MODELS : IMAGE_MODELS
  const aspects = mediaType === 'video' ? ASPECT_RATIOS_VIDEO : ASPECT_RATIOS_IMAGE

  function handleMediaTypeChange(next: MediaType) {
    setMediaType(next)
    // Reset media-specific fields so a stale video tonality doesn't ride
    // along when switching to image.
    setTargetModel('')
    setAspectRatio('')
    setTonality('')
    setPacing('')
    setHookStyle('')
    setImageStyle('')
    setMood('')
    setDuration('')
  }

  // Count active constraints — surfaced in the disclosure header so creators
  // see at a glance how much they've already specified.
  const constraintValues = [
    tonality, pacing, hookStyle, imageStyle, mood, duration, aspectRatio,
    scriptDirection, textOverlayIntent, referenceSubjects, trendReference,
    brandContext, avoidList, language, audience, targetModel,
    workId !== NONE_WORK ? workId : '',
  ]
  const filledCount = constraintValues.filter((v) => v.trim().length > 0).length

  async function handleGenerate() {
    if (!brief.trim()) { setError('Write a brief first'); return }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/studio/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          mediaType,
          platform,
          variantCount: parseInt(variantCount, 10) || 2,
          // Core / soft-steering — backwards compatible with the original API.
          targetAudience: audience || undefined,
          targetModel: targetModel || undefined,
          workId: workId === NONE_WORK ? null : workId,
          // Phase 1 patch — optional creator constraints.
          tonality: tonality || undefined,
          pacing: pacing || undefined,
          hookStyle: hookStyle || undefined,
          imageStyle: imageStyle || undefined,
          mood: mood || undefined,
          duration: duration || undefined,
          aspectRatio: aspectRatio || undefined,
          scriptDirection: scriptDirection || undefined,
          textOverlayIntent: textOverlayIntent || undefined,
          referenceSubjects: referenceSubjects || undefined,
          trendReference: trendReference || undefined,
          brandContext: brandContext || undefined,
          avoidList: avoidList || undefined,
          language: language || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      startTransition(() => router.push(`/app/studio/${data.batchId}`))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed')
      setBusy(false)
    }
  }

  return (
    <div className="relative">
      {/* Soft glow behind the form for a non-boxy feel */}
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-lime-400/10 via-transparent to-transparent blur-sm pointer-events-none" />

      <div className="relative rounded-2xl bg-neutral-950/80 border border-neutral-800/80 backdrop-blur-sm overflow-hidden">
        {/* BRIEF — textarea is the hero, no inner box chrome */}
        <div className="px-6 pt-6 pb-2">
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="What do you want to make? e.g. A 15s UGC reel of a girl unboxing our stuffed cookie, deadpan reaction, ends on the gooey center reveal."
            disabled={busy}
            rows={3}
            className="w-full bg-transparent border-0 outline-none resize-none text-white placeholder:text-neutral-600 text-lg leading-relaxed focus:ring-0"
          />
        </div>

        <div className="border-t border-neutral-900 px-6 py-4 space-y-4">
          {/* MEDIA TYPE — segmented pill */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Type</span>
            <div className="inline-flex rounded-full bg-neutral-900 p-0.5 border border-neutral-800">
              <button
                type="button"
                onClick={() => handleMediaTypeChange('video')}
                disabled={busy}
                className={mediaType === 'video'
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium text-neutral-400 hover:text-white'
                }
              >
                <Video className="size-3.5" /> Video
              </button>
              <button
                type="button"
                onClick={() => handleMediaTypeChange('image')}
                disabled={busy}
                className={mediaType === 'image'
                  ? 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-medium text-neutral-400 hover:text-white'
                }
              >
                <ImageIcon className="size-3.5" /> Image
              </button>
            </div>
          </div>

          {/* PLATFORM — chip group */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">For</span>
            <div className="flex flex-wrap gap-1.5">
              {PLATFORMS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  disabled={busy}
                  className={platform === p.id
                    ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                    : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* VARIANTS + TARGET MODEL row — kept inline to avoid card growth */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Variants</span>
            <div className="inline-flex rounded-full bg-neutral-900 p-0.5 border border-neutral-800">
              {VARIANT_COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setVariantCount(n)}
                  disabled={busy}
                  className={variantCount === n
                    ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                    : 'rounded-full px-3 py-1 text-xs font-medium text-neutral-400 hover:text-white'
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* TARGET MODEL — chip group, optional */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Model</span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setTargetModel('')}
                disabled={busy}
                className={targetModel === ''
                  ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                  : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                }
              >
                Any
              </button>
              {models.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTargetModel(m)}
                  disabled={busy}
                  className={targetModel === m
                    ? 'rounded-full px-3 py-1 text-xs font-medium bg-lime-400 text-black'
                    : 'rounded-full px-3 py-1 text-xs font-medium bg-neutral-900 border border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:text-white'
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* AUDIENCE — inline minimal input */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Audience</span>
            <input
              type="text"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="optional · e.g. Gen-Z snack lovers, India, English"
              disabled={busy}
              className="flex-1 min-w-0 bg-transparent border-0 border-b border-neutral-800 focus:border-lime-400 outline-none text-sm text-white placeholder:text-neutral-600 py-1 transition-colors"
            />
          </div>

          {/* ATTACH — kept as Select since list is dynamic; styled compact */}
          {works.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Attach</span>
              <Select value={workId} onValueChange={(v) => setWorkId(v as string)}>
                <SelectTrigger className="h-7 bg-neutral-900 border-neutral-800 text-xs rounded-full px-3 gap-1.5 hover:border-neutral-700">
                  <SelectValue>
                    {(v: unknown) => {
                      const sel = v as string
                      if (sel === NONE_WORK) return <span className="text-neutral-500">No work</span>
                      return works.find((w) => w.id === sel)?.label || 'No work'
                    }}
                  </SelectValue>
                  <ChevronDown className="size-3 text-neutral-500" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_WORK}>No work</SelectItem>
                  {works.map((w) => <SelectItem key={w.id} value={w.id}>{w.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── CREATIVE DIRECTION (advanced, all optional) ─────────────── */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="flex items-center gap-2 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <ChevronRight
                className={
                  showAdvanced
                    ? 'size-3.5 rotate-90 transition-transform'
                    : 'size-3.5 transition-transform'
                }
              />
              <span className="uppercase tracking-wider">Creative direction</span>
              {filledCount > 0 ? (
                <span className="inline-flex items-center rounded-full bg-lime-400/10 border border-lime-400/30 px-2 py-0.5 text-[10px] text-lime-400 normal-case tracking-normal">
                  {filledCount} set
                </span>
              ) : null}
              <span className="text-neutral-600 normal-case tracking-normal">
                — leave blank and AI decides
              </span>
            </button>

            {showAdvanced ? (
              <div className="mt-4 space-y-4 border-t border-neutral-900 pt-4">
                {/* MEDIA-SPECIFIC selects */}
                {mediaType === 'video' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Style</span>
                    <div className="flex flex-wrap gap-1.5">
                      <AiSelect disabled={busy} value={tonality} onChange={setTonality} options={VIDEO_TONALITIES} placeholder="Tonality" />
                      <AiSelect disabled={busy} value={pacing} onChange={setPacing} options={VIDEO_PACING} placeholder="Pacing" />
                      <AiSelect disabled={busy} value={hookStyle} onChange={setHookStyle} options={HOOK_STYLES} placeholder="Hook style" />
                      <AiSelect
                        disabled={busy}
                        value={duration}
                        onChange={setDuration}
                        options={DURATIONS}
                        formatLabel={(v) => `${v}s`}
                        placeholder="Duration"
                      />
                      <AiSelect disabled={busy} value={aspectRatio} onChange={setAspectRatio} options={aspects} placeholder="Aspect" />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Style</span>
                    <div className="flex flex-wrap gap-1.5">
                      <AiSelect disabled={busy} value={imageStyle} onChange={setImageStyle} options={IMAGE_STYLES} placeholder="Visual style" />
                      <AiSelect disabled={busy} value={mood} onChange={setMood} options={IMAGE_MOODS} placeholder="Mood" />
                      <AiSelect disabled={busy} value={aspectRatio} onChange={setAspectRatio} options={aspects} placeholder="Aspect" />
                    </div>
                  </div>
                )}

                {/* LANGUAGE — shared */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Language</span>
                  <AiSelect disabled={busy} value={language} onChange={setLanguage} options={LANGUAGES} placeholder="AI decides" />
                </div>

                {/* SCRIPT DIRECTION / TEXT OVERLAY — media-aware label */}
                <div className="flex items-start gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16 pt-2 shrink-0">
                    {mediaType === 'video' ? 'Script' : 'Overlay'}
                  </span>
                  <div className="flex-1 min-w-0">
                    {mediaType === 'video' ? (
                      <GhostTextarea
                        disabled={busy}
                        value={scriptDirection}
                        onChange={setScriptDirection}
                        placeholder='e.g. Must include "wait for it…" on screen at 3s. End line must be about the price.'
                      />
                    ) : (
                      <GhostTextarea
                        disabled={busy}
                        value={textOverlayIntent}
                        onChange={setTextOverlayIntent}
                        placeholder='e.g. Headline: "Best cookies in Mumbai". Subtext: "Order now →"'
                      />
                    )}
                  </div>
                </div>

                {/* BRAND CONTEXT */}
                <div className="flex items-start gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16 pt-2 shrink-0">Brand</span>
                  <div className="flex-1 min-w-0">
                    <GhostTextarea
                      disabled={busy}
                      value={brandContext}
                      onChange={setBrandContext}
                      placeholder="e.g. Cookie Cartel — NY-style stuffed cookies from Panchgani. Black and gold brand. Target: premium gifting."
                    />
                  </div>
                </div>

                {/* REFERENCES + TREND — single-line ghost inputs */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Refs</span>
                  <div className="flex-1 min-w-0">
                    <GhostInput
                      disabled={busy}
                      value={referenceSubjects}
                      onChange={setReferenceSubjects}
                      placeholder="reference avatars / elements — e.g. <<<girl-avatar-01>>>, <<<cookie-box>>>"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-neutral-500 w-16">Trend</span>
                  <div className="flex-1 min-w-0">
                    <GhostInput
                      disabled={busy}
                      value={trendReference}
                      onChange={setTrendReference}
                      placeholder='e.g. Ride the "girl dinner" format. Use the "oh no" audio trend.'
                    />
                  </div>
                </div>

                {/* HARD NEGATIVES — uses red accent for clarity */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[10px] uppercase tracking-wider text-red-400/70 w-16">Avoid</span>
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={avoidList}
                      onChange={(e) => setAvoidList(e.target.value)}
                      placeholder="hard negatives — e.g. no voice-over, no slow-mo, no stock footage feel, avoid competitor names"
                      disabled={busy}
                      className="w-full bg-transparent border-0 border-b border-neutral-800 focus:border-red-400 outline-none text-sm text-white placeholder:text-neutral-600 py-1 transition-colors"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* CTA bar */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-neutral-900 bg-neutral-950/60">
          {error ? (
            <span className="text-xs text-red-400">{error}</span>
          ) : (
            <span className="text-xs text-neutral-500">
              {brief.trim().length > 0
                ? `${brief.trim().length} characters · ${variantCount} variant${variantCount === '1' ? '' : 's'} · ${mediaType} for ${platform}`
                : 'Describe your idea above to start'}
            </span>
          )}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || isPending || !brief.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-lime-400 hover:bg-lime-300 text-black font-semibold px-5 py-2 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="size-4" />
            {busy ? 'Generating variants…' : isPending ? 'Opening…' : 'Generate prompts'}
          </button>
        </div>
      </div>

      {/* SHIMMER — only when generating, sits below the form. Count tracks
          the requested variantCount so the placeholders match what's coming. */}
      {busy ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: parseInt(variantCount, 10) || 2 }, (_, i) => i).map((i) => (
            <div
              key={i}
              className="flex gap-3 items-stretch rounded-xl overflow-hidden"
            >
              <div className="w-1 bg-gradient-to-b from-lime-400/40 to-lime-400/10 animate-pulse" />
              <div className="flex-1 h-24 bg-neutral-900/50 animate-pulse" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
