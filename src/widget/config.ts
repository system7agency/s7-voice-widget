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

  // --- Text (all optional; values render as plain text, never HTML) ---

  /**
   * Widget header text (`data-title`). Default: the "S7 LABS // AI" wordmark.
   * On the custom element the attribute is `widget-title`, because bare
   * `title` is a global HTML attribute (browser tooltip).
   */
  title?: string
  /**
   * Welcome message shown as the first assistant message when the chat opens
   * (`data-greeting`). Default: none — the chat starts empty.
   */
  greeting?: string
  /** Launcher button text (`data-button-label`). Default: the "// ASK S7" pill. */
  buttonLabel?: string
  /** Chat input placeholder (`data-placeholder`). */
  placeholder?: string
  /** Send-button / CTA label (`data-cta`). */
  cta?: string

  // --- Colors (all optional; any CSS color value) ---

  /** Primary accent color (`data-accent`). Default `#04e3ee`. */
  accent?: string
  /** Widget panel background (`data-bg`). Default: near-black gradient. */
  bg?: string
  /** Primary text color (`data-text`). Default `#ededed`. */
  textColor?: string
  /** Launcher button (orb) background (`data-button-bg`). Default: accent. */
  buttonBg?: string
}

/**
 * Defaults for the text options that have a plain-string default. `title` and
 * `buttonLabel` default to branded JSX (S⁷ wordmark) rendered by the
 * component when unset, and `greeting` defaults to no message at all.
 */
export const TEXT_DEFAULTS = {
  placeholder: 'Ask anything…',
  cta: '→',
} as const

/** The path the get-a-call backend is mounted at. Combined with `apiBase`. */
export const OUTBOUND_CALL_PATH = '/api/voice/outbound-call'
