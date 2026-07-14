import { createRoot, type Root } from 'react-dom/client'

import { S7ChatWidget } from './widget/S7ChatWidget'
import type { WidgetConfig } from './widget/config'
// Imported as a raw string (Vite `?inline`) so it can be injected directly into
// the element's Shadow DOM, fully isolating the widget's styles from the host.
import widgetCss from './widget/widget.css?inline'

const TAG = 's7-voice-widget'

function readConfig(el: HTMLElement): WidgetConfig {
  return {
    agentId: el.getAttribute('agent-id')?.trim() ?? '',
    apiBase: (el.getAttribute('api-base') ?? '').replace(/\/$/, ''),
    publicPhone: el.getAttribute('public-phone') ?? '',
    enabled: el.getAttribute('enabled') !== 'false',
  }
}

/**
 * `<s7-voice-widget agent-id="agent_..." api-base="https://..." public-phone="+1..." accent="#04e3ee">`
 *
 * Renders the floating chat/voice widget inside an isolated Shadow DOM so the
 * host page's CSS can neither break it nor be broken by it.
 */
class S7VoiceWidgetElement extends HTMLElement {
  private root: Root | null = null

  connectedCallback() {
    if (this.root) return
    const shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = widgetCss
    shadow.appendChild(style)

    // Optional accent override. The widget keys its theme off `--s7-accent`;
    // setting it on `.root` would lose to the value `.root` defines itself, so
    // we append a higher-specificity override only when an accent is supplied.
    const accent = this.getAttribute('accent')?.trim()
    if (accent) {
      const override = document.createElement('style')
      override.textContent = `.root{--s7-accent:${accent};--s7-accent-dim:color-mix(in srgb, ${accent} 18%, transparent);--s7-accent-glow:color-mix(in srgb, ${accent} 35%, transparent);}`
      shadow.appendChild(override)
    }

    const mount = document.createElement('div')
    shadow.appendChild(mount)

    if (!this.getAttribute('agent-id')) {
      console.error(`[${TAG}] missing required "agent-id" attribute — widget not rendered.`)
      return
    }

    this.root = createRoot(mount)
    this.root.render(<S7ChatWidget config={readConfig(this)} />)
  }

  disconnectedCallback() {
    this.root?.unmount()
    this.root = null
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(TAG)) {
  customElements.define(TAG, S7VoiceWidgetElement)
}

/**
 * Auto-mount: if the loader <script> carries `data-agent-id`, create one widget
 * instance and append it to <body>. Lets non-framework sites embed with a single
 * tag and zero JavaScript of their own:
 *
 *   <script src="s7-voice-widget.js"
 *           data-agent-id="agent_..."
 *           data-api-base="https://your-backend.example.com"
 *           data-public-phone="+1..."
 *           data-accent="#04e3ee"></script>
 */
function autoMount() {
  const current =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-agent-id]')
  if (!current?.dataset.agentId) return
  if (document.querySelector(TAG)) return // already mounted

  const el = document.createElement(TAG)
  el.setAttribute('agent-id', current.dataset.agentId)
  if (current.dataset.apiBase) el.setAttribute('api-base', current.dataset.apiBase)
  if (current.dataset.publicPhone) el.setAttribute('public-phone', current.dataset.publicPhone)
  if (current.dataset.accent) el.setAttribute('accent', current.dataset.accent)
  if (current.dataset.enabled) el.setAttribute('enabled', current.dataset.enabled)

  const append = () => document.body.appendChild(el)
  if (document.body) append()
  else document.addEventListener('DOMContentLoaded', append, { once: true })
}

autoMount()

export { S7ChatWidget }
export type { WidgetConfig }
