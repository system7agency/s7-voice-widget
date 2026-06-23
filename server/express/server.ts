/**
 * Standalone Express adapter for the get-a-call backend.
 *
 * For sites with no existing Node backend: deploy this tiny server, set the
 * three ELEVENLABS_* env vars, and point the widget's `data-api-base` at its URL.
 *
 *   npm i express
 *   ELEVENLABS_AGENT_ID=agent_... \
 *   ELEVENLABS_AGENT_PHONE_NUMBER_ID=phnum_... \
 *   ELEVENLABS_API_KEY=sk_... \
 *   node --experimental-strip-types server/express/server.ts
 */
import express from 'express'

import {
  handleOutboundCall,
  clientIpFromHeaders,
  envFromProcess,
} from '../outbound-call'

const app = express()
app.use(express.json())

// Tighten to your widget's host in production (e.g. 'https://acme.com').
const ALLOW_ORIGIN = process.env.WIDGET_ALLOW_ORIGIN ?? '*'

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.post('/api/voice/outbound-call', async (req, res) => {
  // Express needs `app.set('trust proxy', true)` behind a load balancer for
  // x-forwarded-for to be trustworthy.
  const ip = clientIpFromHeaders((name) => {
    const v = req.headers[name.toLowerCase()]
    return Array.isArray(v) ? v[0] : v
  })
  const result = await handleOutboundCall({
    phoneNumber: req.body?.phoneNumber,
    ip,
    env: envFromProcess(),
  })
  res.status(result.status).json(result.body)
})

const PORT = Number(process.env.PORT ?? 8787)
app.listen(PORT, () => {
  console.log(`[s7-voice-widget] outbound-call server listening on :${PORT}`)
})
