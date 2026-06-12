// app/api/studio/generate-prompt/route.ts — brief → structured variants.
// Auth → resolve active org → can(studio,create) → Architect LLM → insert
// one prompt_blueprints row per variant, all sharing a batch_id. No scoring
// (Phase 2), no HF generation ever.
//
// Phase 1 patch: accepts an OPTIONAL bag of creator constraints (tonality,
// pacing, hook style, duration, brand context, hard negatives, etc.). Any
// constraint present is passed to the architect as a HARD requirement; any
// missing constraint is left to the model's judgment. The set of constraints
// is documented in the body type below.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { callLLM, parseLLMJson, ARCHITECT_MODEL } from '@/lib/studio/llm'
import { architectSystemPrompt } from '@/lib/studio/system-prompts'
import { renderPrompt } from '@/lib/studio/render-prompt'
import type { GeneratedVariant, MediaType } from '@/lib/studio/schema'
import { can, type Role } from '@/lib/rbac'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Hard caps so a hand-crafted request can't inflate the LLM payload, the
// brief column, or the architect's context window.
const MAX_BRIEF_LEN = 4000
const MAX_SHORT_LEN = 200    // tonality, pacing, hook style, language, etc.
const MAX_TEXT_LEN = 1500    // script direction, brand context, text overlay
const MAX_LIST_LEN = 600     // reference subjects, avoid list, trend reference
const MIN_VARIANTS = 1
const MAX_VARIANTS = 3
const DEFAULT_VARIANTS = 2

interface GenerateBody {
  brief?: string
  mediaType?: MediaType
  platform?: string
  variantCount?: number
  // ── Optional creator constraints (Phase 1 patch) ───────────────────────
  tonality?: string
  pacing?: string
  hookStyle?: string
  imageStyle?: string
  mood?: string
  duration?: string         // seconds, as a string from the form select
  aspectRatio?: string
  scriptDirection?: string
  textOverlayIntent?: string
  referenceSubjects?: string
  trendReference?: string
  brandContext?: string
  avoidList?: string
  language?: string
  targetAudience?: string
  targetModel?: string
  workId?: string | null
}

// Coerce + cap. Empty → null so the constraint line is dropped entirely.
function cap(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: membership } = await supabase
      .from('memberships')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('approved_at', { ascending: false }) // deterministic: newest active org, matches auth-helpers
      .limit(1)
      .maybeSingle()
    if (!membership) return NextResponse.json({ error: 'No active organization' }, { status: 403 })

    if (!can(membership.role as Role, 'studio', 'create')) {
      return NextResponse.json({ error: 'Not permitted' }, { status: 403 })
    }

    let body: GenerateBody
    try {
      body = (await req.json()) as GenerateBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const brief = cap(body.brief, MAX_BRIEF_LEN)
    if (!brief) return NextResponse.json({ error: 'Brief is required' }, { status: 400 })
    if (body.mediaType !== 'video' && body.mediaType !== 'image') {
      return NextResponse.json({ error: 'Invalid media type' }, { status: 400 })
    }
    // Cap platform — flows into the prompt and into the schema. A hand-crafted
    // long string could otherwise inflate the architect's input window.
    const platform = cap(body.platform, MAX_SHORT_LEN) ?? 'other'

    // Validate workId is in the same org as the blueprint (defense-in-depth —
    // mirrors the PATCH route in Phase 4). Without this, a creator could
    // attach a blueprint to a foreign work UUID at creation time.
    let workId: string | null = null
    if (typeof body.workId === 'string' && body.workId.length > 0) {
      const { data: work, error: workErr } = await supabase
        .from('works')
        .select('id, org_id')
        .eq('id', body.workId)
        .maybeSingle()
      if (workErr) {
        console.error('[studio:generate-prompt] work read failed:', workErr.message)
        return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
      }
      if (!work || work.org_id !== membership.org_id) {
        return NextResponse.json(
          { error: 'Work does not belong to this organization' },
          { status: 400 },
        )
      }
      workId = body.workId
    }

    // Clamp variantCount to [MIN, MAX]. The architect prompt asks for this
    // many; the DB-insert loop accepts whatever the model actually returns.
    const requestedCount =
      typeof body.variantCount === 'number' && Number.isFinite(body.variantCount)
        ? Math.max(MIN_VARIANTS, Math.min(MAX_VARIANTS, Math.floor(body.variantCount)))
        : DEFAULT_VARIANTS

    // ---- Build the constraints block ----
    // Each entry below is `(required)` flagged when the architect must
    // respect it verbatim; brand/audience/language are softer steering.
    const constraints: string[] = []
    const tonality = cap(body.tonality, MAX_SHORT_LEN)
    const pacing = cap(body.pacing, MAX_SHORT_LEN)
    const hookStyle = cap(body.hookStyle, MAX_SHORT_LEN)
    const imageStyle = cap(body.imageStyle, MAX_SHORT_LEN)
    const mood = cap(body.mood, MAX_SHORT_LEN)
    const duration = cap(body.duration, MAX_SHORT_LEN)
    const aspectRatio = cap(body.aspectRatio, MAX_SHORT_LEN)
    const scriptDirection = cap(body.scriptDirection, MAX_TEXT_LEN)
    const textOverlayIntent = cap(body.textOverlayIntent, MAX_TEXT_LEN)
    const referenceSubjects = cap(body.referenceSubjects, MAX_LIST_LEN)
    const trendReference = cap(body.trendReference, MAX_LIST_LEN)
    const brandContext = cap(body.brandContext, MAX_TEXT_LEN)
    const avoidList = cap(body.avoidList, MAX_LIST_LEN)
    const language = cap(body.language, MAX_SHORT_LEN)
    const targetAudience = cap(body.targetAudience, MAX_SHORT_LEN)
    const targetModel = cap(body.targetModel, MAX_SHORT_LEN)

    if (tonality) constraints.push(`TONALITY (required): ${tonality}`)
    if (pacing) constraints.push(`PACING (required): ${pacing}`)
    if (hookStyle) constraints.push(`HOOK STYLE (required): ${hookStyle}`)
    if (imageStyle) constraints.push(`VISUAL STYLE (required): ${imageStyle}`)
    if (mood) constraints.push(`MOOD (required): ${mood}`)
    if (duration) constraints.push(`DURATION (required): ${duration}s`)
    if (aspectRatio) constraints.push(`ASPECT RATIO (required): ${aspectRatio}`)
    if (scriptDirection)
      constraints.push(`SCRIPT DIRECTION (required, exact lines must appear verbatim in dialogue[].line or full_script): ${scriptDirection}`)
    if (textOverlayIntent)
      constraints.push(`TEXT OVERLAY (required, exact copy must appear verbatim in text_overlay[].copy): ${textOverlayIntent}`)
    if (referenceSubjects)
      constraints.push(`REFERENCE SUBJECTS/ELEMENTS (required, embed EXACTLY as <<<name>>> in subjects[].consistency_ref, verbatim): ${referenceSubjects}`)
    if (trendReference) constraints.push(`TREND TO RIDE (required): ${trendReference}`)
    if (brandContext) constraints.push(`BRAND CONTEXT: ${brandContext}`)
    if (avoidList) constraints.push(`HARD NEGATIVES — NEVER include any of: ${avoidList}`)
    if (language) constraints.push(`LANGUAGE / REGION: ${language}`)
    if (targetAudience) constraints.push(`TARGET AUDIENCE: ${targetAudience}`)
    if (targetModel) constraints.push(`TARGET HF MODEL: ${targetModel}`)

    const userMsg = [
      `BRIEF: ${brief}`,
      `PLATFORM: ${platform}`,
      `NUMBER OF VARIANTS REQUIRED: ${requestedCount}`,
      constraints.length
        ? `\nCREATOR CONSTRAINTS (treat anything marked "(required)" as a hard requirement; you MUST respect it in EVERY variant):\n${constraints.join('\n')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n')

    // maxTokens scales with variantCount. A full video schema can land
    // around 8-10k output tokens; 3 variants needs more headroom than 2.
    const maxTokens = requestedCount === 3 ? 24000 : 16000

    const raw = await callLLM({
      system: architectSystemPrompt(body.mediaType),
      user: userMsg,
      model: ARCHITECT_MODEL,
      maxTokens,
      jsonMode: true,   // OpenAI json_object mode guarantees parseable JSON output
    })

    const parsed = parseLLMJson<{ variants: GeneratedVariant[] }>(raw)
    if (!parsed.variants?.length) {
      return NextResponse.json({ error: 'No variants generated' }, { status: 502 })
    }

    // Drop any variant whose schema is missing or whose media_type doesn't match
    // the request — renderPrompt branches on media_type, and the DB column is set
    // from body.mediaType, so the two must agree. Prevents passing undefined to
    // renderPrompt (which would throw mid-request).
    const variants = parsed.variants.filter(
      (v) => v?.schema && v.schema.media_type === body.mediaType,
    )
    if (!variants.length) {
      return NextResponse.json({ error: 'No valid variants generated' }, { status: 502 })
    }

    const batchId = crypto.randomUUID()
    const rows = variants.map((v) => ({
      org_id: membership.org_id,
      batch_id: batchId,
      work_id: workId,
      created_by: user.id,
      media_type: body.mediaType,
      brief,
      variant_label: v.variant_label || 'Variant',
      schema_json: v.schema,
      rendered_prompt: renderPrompt(v.schema),
    }))

    const { error } = await supabase.from('prompt_blueprints').insert(rows)
    if (error) {
      console.error('[studio:generate-prompt] insert failed:', error.message)
      return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
    }

    return NextResponse.json({ batchId, count: rows.length })
  } catch (err: unknown) {
    console.error('[studio:generate-prompt]', err)
    const msg = err instanceof Error ? err.message : 'Generation failed'
    // Surface user-facing infra messages verbatim; everything else is generic.
    const safe =
      msg.startsWith('OPENAI_API_KEY') || msg.includes('temporarily overloaded')
        ? msg
        : 'Generation failed'
    return NextResponse.json({ error: safe }, { status: 500 })
  }
}
