import { createRoot, type Root } from 'react-dom/client'

import { S7ChatWidget } from './widget/S7ChatWidget'
import type { WidgetConfig } from './widget/config'
// Imported as a raw string (Vite `?inline`) so it can be injected directly into
// the element's Shadow DOM, fully isolating the widget's styles from the host.
import widgetCss from './widget/widget.css?inline'

const TAG = 's7-voice-widget'

function readConfig(el: HTMLElement): WidgetConfig {
  // Text/color attributes are optional: empty or missing -> undefined, and the
  // widget falls back to its stock value. Values render as plain text (React
  // text nodes) or CSS variable values — never as HTML.
  const attr = (name: string) => el.getAttribute(name)?.trim() || undefined
  return {
    agentId: el.getAttribute('agent-id')?.trim() ?? '',
    apiBase: (el.getAttribute('api-base') ?? '').replace(/\/$/, ''),
    publicPhone: el.getAttribute('public-phone') ?? '',
    enabled: el.getAttribute('enabled') !== 'false',
    // Text. `widget-title` (not `title`, which is the global tooltip attribute).
    title: attr('widget-title'),
    greeting: attr('greeting'),
    buttonLabel: attr('button-label'),
    placeholder: attr('placeholder'),
    cta: attr('cta'),
    // Colors.
    accent: attr('accent'),
    bg: attr('bg'),
    textColor: attr('text'),
    buttonBg: attr('button-bg'),
  }
}

/**
 * `data-*` keys on the loader <script> (camelCase, as exposed by `dataset`)
 * and the corresponding attribute on the <s7-voice-widget> element.
 * `data-title` maps to `widget-title` because bare `title` is the global
 * HTML tooltip attribute.
 */
const SCRIPT_DATA_ATTRS: ReadonlyArray<readonly [string, string]> = [
  ['apiBase', 'api-base'],
  ['publicPhone', 'public-phone'],
  ['enabled', 'enabled'],
  ['title', 'widget-title'],
  ['greeting', 'greeting'],
  ['buttonLabel', 'button-label'],
  ['placeholder', 'placeholder'],
  ['cta', 'cta'],
  ['accent', 'accent'],
  ['bg', 'bg'],
  ['text', 'text'],
  ['buttonBg', 'button-bg'],
]

/**
 * `<s7-voice-widget agent-id="agent_..." api-base="https://..." public-phone="+1..."
 *    widget-title="ACME // AI" greeting="Hi!" button-label="// ASK ACME"
 *    placeholder="ask anything_" cta="Send"
 *    accent="#0009ff" bg="#000000" text="#ffffff" button-bg="#0009ff">`
 *
 * All attributes except `agent-id` are optional. Renders the floating
 * chat/voice widget inside an isolated Shadow DOM so the host page's CSS can
 * neither break it nor be broken by it.
 */
class S7VoiceWidgetElement extends HTMLElement {
  private root: Root | null = null

  connectedCallback() {
    if (this.root) return
    const shadow = this.attachShadow({ mode: 'open' })

    const style = document.createElement('style')
    style.textContent = widgetCss
    shadow.appendChild(style)

    // Color overrides (accent, bg, text, button-bg) are applied by the widget
    // itself: it sets the corresponding CSS variables inline on its `.root`,
    // which beats the defaults `.root` declares in widget.css.

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
 *           data-title="ACME // AI" data-greeting="Hi! How can we help?"
 *           data-button-label="// ASK ACME" data-placeholder="ask anything_"
 *           data-cta="Send" data-accent="#7c5cff" data-bg="#0d0a1a"
 *           data-text="#f2eeff" data-button-bg="#7c5cff"></script>
 */
function autoMount() {
  const current =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-agent-id]')
  if (!current?.dataset.agentId) return
  if (document.querySelector(TAG)) return // already mounted

  const el = document.createElement(TAG)
  el.setAttribute('agent-id', current.dataset.agentId)
  for (const [dataKey, attrName] of SCRIPT_DATA_ATTRS) {
    const value = current.dataset[dataKey]
    if (value) el.setAttribute(attrName, value)
  }

  const append = () => document.body.appendChild(el)
  if (document.body) append()
  else document.addEventListener('DOMContentLoaded', append, { once: true })
}

autoMount()

export { S7ChatWidget }
export type { WidgetConfig }
