/**
 * Framework-agnostic core for the "Get a call" (outbound dial) feature.
 *
 * This is the ONLY part of the widget that needs a server: a browser cannot
 * safely hold the ElevenLabs API key, and outbound calls require it. Wrap
 * `handleOutboundCall` in whatever runtime you deploy (see ./next and ./express).
 *
 * Ported from the s7labs `/api/voice/outbound-call` route. Behaviour — E.164
 * validation, 3-calls-per-IP-per-hour in-memory rate limit, 20s upstream
 * timeout, secret-safe error logging — is unchanged.
 */

const ELEVENLABS_OUTBOUND_URL = 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call'
const TIMEOUT_MS = 20_000

// E.164: leading +, first digit 1-9, up to 14 more digits.
const E164_RE = /^\+[1-9]\d{6,14}$/

// --- Rate limiting: max 3 outbound calls per IP per hour (in-memory) ---
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const callLog = new Map<string, number[]>()

/** Returns true if the IP is within its hourly quota, recording the attempt. */
function withinRateLimit(ip: string): boolean {
  const now = Date.now()
  const recent = (callLog.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) {
    callLog.set(ip, recent)
    return false
  }
  recent.push(now)
  callLog.set(ip, recent)
  return true
}

export type OutboundEnv = {
  /** ElevenLabs public agent id (`agent_...`). */
  agentId?: string
  /** Phone-number id (`phnum_...`) assigned to the agent. */
  agentPhoneNumberId?: string
  /** Secret ElevenLabs API key (`xi-api-key`). Server-only. */
  apiKey?: string
}

export type OutboundResult = {
  status: number
  body: Record<string, unknown>
}

/**
 * Validate + rate-limit + place an outbound call. Pure function of its inputs;
 * read env and client IP in your adapter and pass them in.
 */
export async function handleOutboundCall(args: {
  phoneNumber: unknown
  ip: string
  env: OutboundEnv
}): Promise<OutboundResult> {
  const { ip, env } = args

  const phoneNumber = typeof args.phoneNumber === 'string' ? args.phoneNumber.trim() : ''
  if (!phoneNumber || !E164_RE.test(phoneNumber)) {
    return { status: 400, body: { error: 'Invalid phone number' } }
  }

  if (!withinRateLimit(ip)) {
    return { status: 429, body: { error: 'Too many call requests. Try again in an hour.' } }
  }

  const { agentId, agentPhoneNumberId, apiKey } = env
  const missing = [
    !agentId && 'ELEVENLABS_AGENT_ID',
    !agentPhoneNumberId && 'ELEVENLABS_AGENT_PHONE_NUMBER_ID',
    !apiKey && 'ELEVENLABS_API_KEY',
  ].filter(Boolean)

  if (missing.length > 0) {
    // Names only — never log the key's value.
    console.error('[outbound-call] Missing env var(s):', missing.join(', '))
    return { status: 500, body: { error: 'Service not configured' } }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const upstream = await fetch(ELEVENLABS_OUTBOUND_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey as string,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: agentPhoneNumberId,
        to_number: phoneNumber,
      }),
      signal: controller.signal,
      cache: 'no-store',
    })

    const data = (await upstream.json().catch(() => ({}))) as {
      conversation_id?: string
      conversationId?: string
      detail?: unknown
      message?: unknown
      error?: unknown
    }

    if (!upstream.ok) {
      const errorMessage =
        extractMessage(data.detail) ||
        extractMessage(data.message) ||
        extractMessage(data.error) ||
        'Failed to place call'
      console.error('[outbound-call] ElevenLabs error', upstream.status, errorMessage)
      return { status: upstream.status, body: { error: errorMessage } }
    }

    return {
      status: 200,
      body: { success: true, conversationId: data.conversation_id ?? data.conversationId ?? null },
    }
  } catch (err) {
    console.error('[outbound-call] Unexpected failure:', err)
    return { status: 500, body: { error: 'Could not place call. Please try again.' } }
  } finally {
    clearTimeout(timer)
  }
}

/** ElevenLabs error bodies vary — detail can be a string or { message } object. */
function extractMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && 'message' in value) {
    const m = (value as { message?: unknown }).message
    if (typeof m === 'string' && m.trim()) return m.trim()
  }
  return null
}

/** Extract the client IP from common proxy headers. */
export function clientIpFromHeaders(get: (name: string) => string | null | undefined): string {
  const forwarded = get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]!.trim()
  return get('x-real-ip')?.trim() || 'unknown'
}

/** Read the ElevenLabs env vars from process.env (server-only). */
export function envFromProcess(): OutboundEnv {
  return {
    agentId: process.env.ELEVENLABS_AGENT_ID ?? process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID,
    agentPhoneNumberId: process.env.ELEVENLABS_AGENT_PHONE_NUMBER_ID,
    apiKey: process.env.ELEVENLABS_API_KEY,
  }
}
