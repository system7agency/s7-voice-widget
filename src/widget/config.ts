/**
 * Runtime configuration for the widget.
 *
 * In the original s7labs app these values came from `NEXT_PUBLIC_*` build-time
 * env vars. In a portable, drop-anywhere build there is no build step on the
 * host, so configuration is supplied at runtime via attributes on the
 * `<s7-voice-widget>` element (or the `data-*` attributes of the loader
 * `<script>` tag). See `src/embed.tsx`.
 */
export type WidgetConfig = {
  /** ElevenLabs public agent id (`agent_...`). Required. */
  agentId: string
  /**
   * Base URL where the outbound-call backend is hosted, e.g.
   * `https://api.example.com`. The widget POSTs to
   * `${apiBase}/api/voice/outbound-call`. Empty string = same origin as the
   * host page. Only needed for the "Get a call" feature.
   */
  apiBase: string
  /** Public phone number shown in the "Call us directly" option. Optional. */
  publicPhone: string
  /** Master on/off switch. Defaults to true. */
  enabled: boolean
}

/** The path the get-a-call backend is mounted at. Combined with `apiBase`. */
export const OUTBOUND_CALL_PATH = '/api/voice/outbound-call'
