# S7 Voice Widget

An embeddable ElevenLabs **chat + voice** widget — the floating cyan bubble from
[s7labs.ai](https://s7labs.ai), extracted into a standalone, drop-anywhere
component. Same design, same behaviour. Add your ElevenLabs agent and it works.

Three modes, all preserved from the original:

- **Chat** — text conversation with your ElevenLabs agent
- **Voice (in browser)** — live mic/speaker voice call over WebRTC
- **Get a call** — visitor enters a number, your agent dials them (needs a backend)

The UI lives inside a **Shadow DOM**, so the host page's CSS can neither break it
nor be broken by it.

---

## Quick start (any website)

1. Build the bundle:

   ```bash
   npm install
   npm run build      # -> dist/s7-voice-widget.js
   ```

2. Host `dist/s7-voice-widget.js` somewhere (your site, a CDN, etc.) and drop
   one tag on any page:

   ```html
   <script
     src="https://your-cdn.com/s7-voice-widget.js"
     data-agent-id="agent_xxxxxxxxxxxxxxxxxxxxxxxx"
   ></script>
   ```

That's it for **chat + in-browser voice** — no backend, no secret key, because a
public ElevenLabs agent connects directly from the browser.

### Configuration (script `data-*` attributes)

| Attribute           | Required | Description                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------------- |
| `data-agent-id`     | ✅       | Your ElevenLabs **public** agent id (`agent_...`).                           |
| `data-api-base`     | for get-a-call | Base URL of your outbound-call backend, e.g. `https://api.acme.com`. Empty = same origin. |
| `data-public-phone` | optional | Number shown in the "Call us directly" option (e.g. `+1 555 010 1234`).      |
| `data-accent`       | optional | Primary accent color override (default `#04e3ee`).                          |
| `data-enabled`      | optional | Set to `false` to hard-disable the widget.                                  |

### Use as a custom element instead

The bundle also registers a custom element, if you'd rather place it yourself:

```html
<s7-voice-widget agent-id="agent_xxx" api-base="https://api.acme.com"></s7-voice-widget>
<script src="https://your-cdn.com/s7-voice-widget.js"></script>
```

### Use in a React / Next.js app

```bash
npm install   # this package
```

```tsx
import { S7ChatWidget } from 's7-voice-widget'

<S7ChatWidget
  config={{
    agentId: 'agent_xxx',
    apiBase: '',          // same-origin backend
    publicPhone: '',
    enabled: true,
  }}
/>
```

> Note: imported as a React component you supply your own styling context; the
> shadow-DOM isolation applies to the `<script>`/custom-element path. For most
> React apps the component renders fine directly.

---

## The "Get a call" backend (only if you want outbound dialing)

Outbound calls require the **secret** ElevenLabs API key, which a browser must
never hold. So get-a-call needs a small server endpoint. Everything else stays
client-side.

The endpoint logic is framework-agnostic in [`server/outbound-call.ts`](server/outbound-call.ts),
with ready adapters:

- **Next.js** — copy [`server/next/route.ts`](server/next/route.ts) to
  `app/api/voice/outbound-call/route.ts`.
- **Express / standalone** — run [`server/express/server.ts`](server/express/server.ts).

Set these **server-only** env vars (see [`.env.example`](.env.example)):

```bash
ELEVENLABS_AGENT_ID=agent_xxx
ELEVENLABS_AGENT_PHONE_NUMBER_ID=phnum_xxx
ELEVENLABS_API_KEY=sk_xxx
WIDGET_ALLOW_ORIGIN=https://your-site.com   # CORS lock (default "*")
```

Then point the widget at it: `data-api-base="https://your-backend.com"`. The
widget POSTs to `${api-base}/api/voice/outbound-call`.

You also need an agent **phone number** configured in ElevenLabs (Twilio-linked)
for outbound dialing — that's an ElevenLabs dashboard step, not something this
repo can do for you.

Built in: E.164 validation, a 3-calls-per-IP-per-hour rate limit, a 20s upstream
timeout, and secret-safe error logging.

---

## What needs what

| Mode               | Needs backend? | Needs secret key? | Just works with `data-agent-id`? |
| ------------------ | -------------- | ----------------- | -------------------------------- |
| Chat               | ❌             | ❌                | ✅                               |
| Voice (in browser) | ❌             | ❌                | ✅                               |
| Get a call         | ✅             | ✅ (server-side)  | ❌ (also needs `data-api-base`)  |

---

## Project layout

```
src/
  embed.tsx              # custom element + Shadow DOM mount + script auto-mount
  widget/
    S7ChatWidget.tsx     # the widget (ported from s7labs, near 1:1)
    widget.css           # styles, injected into the shadow root
    config.ts            # runtime config types
server/
  outbound-call.ts       # framework-agnostic get-a-call core
  next/route.ts          # Next.js App Router adapter (with CORS)
  express/server.ts      # standalone Express server (with CORS)
examples/
  plain-html/index.html  # one-tag embed demo
```

## Development

```bash
npm run dev         # vite dev server
npm run build       # produce dist/s7-voice-widget.js
npm run typecheck   # tsc --noEmit
```

## Credits

Powered by [ElevenLabs](https://elevenlabs.io). Extracted from the S7 Labs
website widget.
