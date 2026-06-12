// lib/studio/schema.ts — Eigen Studio structured prompt schema.
// Claude fills this object; render-prompt.ts flattens it into the HF-ready string.

export type MediaType = 'video' | 'image'
export type Platform = 'tiktok' | 'reels' | 'shorts' | 'youtube' | 'instagram_feed' | 'other'

export interface SubjectSpec {
  kind: 'avatar' | 'person' | 'element' | 'product'
  description: string
  consistency_ref?: string
  notes?: string
}

export interface LightingSpec {
  setup: string
  color_temperature: string
  motivation: string
  volumetrics?: string
}

export interface VideoScene {
  index: number
  setting: string
  time_of_day: string
  shot_size: 'ECU' | 'CU' | 'MCU' | 'MS' | 'MWS' | 'WS' | 'EWS'
  lens: string
  camera_movement: string
  camera_height: 'low' | 'eye' | 'high' | 'overhead'
  composition: string
  action: string
  duration_seconds: number
}

export interface DialogueLine {
  speaker: string
  line: string
  emotion: string
  timing_seconds: number
}

export interface VideoPromptSchema {
  media_type: 'video'
  concept: string
  hook: string
  full_script: string
  dialogue: DialogueLine[]
  tonality: string
  pacing: string
  narrative_arc: string
  silence_beats: string[]
  cta: string
  loopability: string
  subjects: SubjectSpec[]
  scenes: VideoScene[]
  transitions: string[]
  lighting: LightingSpec
  color_palette: string
  film_emulation?: string
  aspect_ratio: '9:16' | '16:9' | '1:1'
  music: string
  sfx: string[]
  voice?: string
  platform: Platform
  target_audience: string
  trend_alignment?: string
  duration_seconds: number
  target_model?: string
}

export interface TextOverlay {
  copy: string
  placement: string
  style_feel: string
}

export interface ImagePromptSchema {
  media_type: 'image'
  concept: string
  visual_hook: string
  scene: string
  subjects: SubjectSpec[]
  composition: string
  shot_size: string
  lens: string
  lighting: LightingSpec
  color_palette: string
  texture_detail: string
  style_medium: string
  text_overlay: TextOverlay[]
  mood: string
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5'
  realism_tokens?: string
  platform: Platform
  target_audience: string
  target_model?: string
}

export type PromptSchema = VideoPromptSchema | ImagePromptSchema

export interface GeneratedVariant {
  variant_label: string
  schema: PromptSchema
}
