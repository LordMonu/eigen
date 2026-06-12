// lib/studio/llm.ts — LLM wrapper for Eigen Studio. SERVER-ONLY.
// OPENAI_API_KEY is read here; never import this into a client component.
//
// Why OpenAI: GPT-4o with native JSON mode (guarantees parseable JSON output),
// strong creative generation + scoring quality. Get a key at:
//   https://platform.openai.com/api-keys
//
// Reliability: the API can return 429 (rate-limited) or 5xx transients on the
// primary model. callLLM retries with exponential backoff, then falls back to
// FALLBACK_MODEL ('gpt-4o-mini' — cheaper, faster) so a transient overload
// never breaks the route.
//
// To swap providers (Gemini, Anthropic, Groq, etc.), only callLLM() and the
// MODEL constants below need to change. Route handlers and the parser stay identical.

export const ARCHITECT_MODEL = 'gpt-4o'      // creative prompt generation
export const SCORER_MODEL    = 'gpt-4o'      // Phase 2 — quality scoring
export const ENHANCE_MODEL   = 'gpt-4o'      // Phase 3
const FALLBACK_MODEL         = 'gpt-4o-mini' // used on 5xx/429 of primary

// HTTP statuses worth retrying. 429 = rate-limited; 500/502/503/504 = transient.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])
const MAX_ATTEMPTS_PER_MODEL = 3
const BACKOFF_BASE_MS = 800

interface LLMCallOpts {
  system: string
  user: string
  model: string
  maxTokens?: number
  /** Force the model to return strict JSON (OpenAI json_object mode). */
  jsonMode?: boolean
  /**
   * Called once with the model that actually produced the successful
   * response. Use this to persist a truthful `model_version` when the
   * fallback runs — callers that record the requested model instead would
   * silently attribute fallback output to the primary.
   */
  onModelUsed?: (model: string) => void
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

async function callOnce(
  apiKey: string,
  opts: Required<Omit<LLMCallOpts, 'jsonMode' | 'onModelUsed'>> & {
    jsonMode: boolean
  },
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user',   content: opts.user   },
      ],
      max_tokens: opts.maxTokens,
      temperature: 0.9,
      // json_object mode requires the word "json" to appear in the system
      // prompt (both architectSystemPrompt and scorerSystemPrompt already
      // include "Output ONLY valid JSON"), or OpenAI returns a 400.
      ...(opts.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, status: res.status, detail }
  }

  const data: {
    choices?: Array<{
      message?: { content?: string | null }
      finish_reason?: string
    }>
  } = await res.json()

  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) {
    const reason = data.choices?.[0]?.finish_reason ?? 'no content'
    return { ok: false, status: 502, detail: `Empty response (${reason})` }
  }
  return { ok: true, text }
}

export async function callLLM({
  system,
  user,
  model,
  maxTokens = 8000,
  jsonMode = false,
  onModelUsed,
}: LLMCallOpts): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not configured. Add it to .env.local and restart. ' +
      'Get a key at https://platform.openai.com/api-keys',
    )
  }

  // Try the requested model with retry/backoff; if it stays unavailable, try
  // the fallback (only if it's a different model from the one already tried).
  const modelsToTry = model === FALLBACK_MODEL ? [model] : [model, FALLBACK_MODEL]
  let lastErr = 'unknown error'

  for (const m of modelsToTry) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_MODEL; attempt++) {
      const result = await callOnce(apiKey, {
        system, user, model: m, maxTokens, jsonMode,
      })
      if (result.ok) {
        onModelUsed?.(m)
        return result.text
      }

      lastErr = `OpenAI API ${result.status} on ${m}: ${result.detail}`

      // Non-retryable: surface immediately (auth errors, bad request, etc.).
      if (!RETRYABLE_STATUSES.has(result.status)) {
        throw new Error(lastErr)
      }

      // Last attempt for this model → break out so we move to the fallback.
      if (attempt === MAX_ATTEMPTS_PER_MODEL - 1) break

      // Exponential backoff (deterministic seed by attempt so tests stay
      // reproducible — no Math.random).
      const delay = BACKOFF_BASE_MS * 2 ** attempt
      console.warn(
        `[studio] ${m} returned ${result.status}; retrying in ${delay}ms (attempt ${attempt + 2}/${MAX_ATTEMPTS_PER_MODEL})`,
      )
      await sleep(delay)
    }
    if (m !== FALLBACK_MODEL) {
      console.warn(`[studio] ${m} unavailable after retries; falling back to ${FALLBACK_MODEL}`)
    }
  }

  throw new Error(
    `${lastErr}. The model is temporarily overloaded — please try again in a minute.`,
  )
}

/** Strip markdown fences (rare under JSON mode, but defensive). */
export function parseLLMJson<T>(raw: string): T {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  }
  const first = s.indexOf('{')
  const last = s.lastIndexOf('}')
  if (first !== -1 && last !== -1) s = s.slice(first, last + 1)
  try {
    return JSON.parse(s) as T
  } catch {
    // Log the tail so truncation vs. malformed JSON is obvious in server logs.
    const tail = raw.length > 500 ? `…${raw.slice(-500)}` : raw
    console.error('[studio:parseLLMJson] raw response tail:', tail)
    console.error('[studio:parseLLMJson] total raw length:', raw.length, 'chars')
    throw new Error(
      `LLM returned a response that was not valid JSON (${raw.length} chars). ` +
      'This is usually caused by token-limit truncation — the response was cut mid-stream.',
    )
  }
}
