// lib/studio/render-prompt.ts — schema_json → HF-ready prompt string.
// Video → cinematic paragraphs; Image → tight descriptive blocks.
//
// IMPORTANT: Claude's JSON is not runtime-validated (parseClaudeJson only casts),
// so any array/object field may be missing in practice even though the TS type
// marks it required. Every access here is defensive — a partial response must
// degrade gracefully, never throw.

import type { PromptSchema, VideoPromptSchema, ImagePromptSchema, LightingSpec } from './schema'

const EMPTY_LIGHTING: LightingSpec = { setup: '', color_temperature: '', motivation: '' }

function lightingStr(l: LightingSpec | undefined): string {
  const x = l ?? EMPTY_LIGHTING
  const parts = [x.setup, x.color_temperature, x.motivation].filter(Boolean)
  return `${parts.join(', ')}${x.volumetrics ? `, ${x.volumetrics}` : ''}`
}

export function renderPrompt(schema: PromptSchema): string {
  return schema.media_type === 'video'
    ? renderVideo(schema)
    : renderImage(schema)
}

function renderVideo(s: VideoPromptSchema): string {
  const subjects = s.subjects ?? []
  const scenes = s.scenes ?? []
  const dialogue = s.dialogue ?? []
  const silenceBeats = s.silence_beats ?? []
  const sfx = s.sfx ?? []
  const transitions = s.transitions ?? []

  const lines: string[] = []
  lines.push(s.concept ?? '')
  lines.push('')
  lines.push(`HOOK (0-3s): ${s.hook ?? ''}`)
  lines.push('')
  if (subjects.length) {
    lines.push('SUBJECTS:')
    subjects.forEach((x) => {
      const ref = x.consistency_ref ? ` <<<${x.consistency_ref}>>>` : ''
      lines.push(`- ${x.description}${ref}${x.notes ? ` (${x.notes})` : ''}`)
    })
    lines.push('')
  }
  if (scenes.length) {
    lines.push('SHOT SEQUENCE:')
    scenes
      .slice()
      .sort((a, b) => a.index - b.index)
      .forEach((sc) => {
        lines.push(
          `${sc.index}. [${sc.shot_size}, ${sc.lens}, ${sc.camera_movement}, ${sc.camera_height}-angle, ${sc.composition}] ` +
            `${sc.setting}, ${sc.time_of_day}. ${sc.action} (${sc.duration_seconds}s)`
        )
      })
    lines.push('')
  }
  if (dialogue.length) {
    lines.push('DIALOGUE:')
    dialogue.forEach((d) => lines.push(`- [${d.timing_seconds}s] ${d.speaker} (${d.emotion}): "${d.line}"`))
    lines.push('')
  }
  lines.push(`LOOK: ${s.color_palette ?? ''}. Lighting: ${lightingStr(s.lighting)}.${s.film_emulation ? ` ${s.film_emulation}.` : ''}`)
  lines.push(`PACING: ${s.pacing ?? ''}. ARC: ${s.narrative_arc ?? ''}.`)
  if (silenceBeats.length) lines.push(`SILENCE: ${silenceBeats.join('; ')}.`)
  lines.push(`AUDIO: music — ${s.music ?? ''}.${sfx.length ? ` SFX — ${sfx.join(', ')}.` : ''}${s.voice ? ` VO — ${s.voice}.` : ''}`)
  lines.push(`TONE: ${s.tonality ?? ''}. CTA: ${s.cta ?? ''}. Loop: ${s.loopability ?? ''}.`)
  if (transitions.length) lines.push(`TRANSITIONS: ${transitions.join(', ')}.`)
  lines.push(`FORMAT: ${s.aspect_ratio ?? '9:16'}, ${s.duration_seconds ?? '?'}s, ${s.platform ?? ''}.${s.trend_alignment ? ` Trend: ${s.trend_alignment}.` : ''}`)
  return lines.join('\n')
}

function renderImage(s: ImagePromptSchema): string {
  const subjects = s.subjects ?? []
  const textOverlay = s.text_overlay ?? []

  const lines: string[] = []
  lines.push(s.concept ?? '')
  lines.push('')
  lines.push(`VISUAL HOOK: ${s.visual_hook ?? ''}`)
  lines.push(`SCENE: ${s.scene ?? ''}`)
  if (subjects.length) {
    lines.push('SUBJECTS:')
    subjects.forEach((x) => {
      const ref = x.consistency_ref ? ` <<<${x.consistency_ref}>>>` : ''
      lines.push(`- ${x.description}${ref}${x.notes ? ` (${x.notes})` : ''}`)
    })
  }
  lines.push(`COMPOSITION: ${s.composition ?? ''}. ${s.shot_size ?? ''}, ${s.lens ?? ''}.`)
  lines.push(`LIGHTING: ${lightingStr(s.lighting)}.`)
  lines.push(`PALETTE: ${s.color_palette ?? ''}. TEXTURE: ${s.texture_detail ?? ''}. STYLE: ${s.style_medium ?? ''}. MOOD: ${s.mood ?? ''}.`)
  if (textOverlay.length) {
    lines.push('TEXT OVERLAY:')
    textOverlay.forEach((t) => lines.push(`- "${t.copy}" — ${t.placement}, ${t.style_feel}`))
  }
  if (s.realism_tokens) lines.push(`REALISM: ${s.realism_tokens}.`)
  lines.push(`FORMAT: ${s.aspect_ratio ?? '9:16'}, ${s.platform ?? ''}.`)
  return lines.join('\n')
}
