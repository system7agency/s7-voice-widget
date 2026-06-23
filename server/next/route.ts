/**
 * Next.js (App Router) adapter for the get-a-call backend.
 *
 * Drop this file at `app/api/voice/outbound-call/route.ts` in your Next.js
 * project (adjust the import path to wherever you keep `outbound-call.ts`).
 * It adds permissive CORS so the widget can call it from another origin —
 * tighten `ALLOW_ORIGIN` to your widget's host in production.
 */
import {
  handleOutboundCall,
  clientIpFromHeaders,
  envFromProcess,
} from '../outbound-call'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Set to your embedding site's origin in production, e.g. 'https://acme.com'.
const ALLOW_ORIGIN = process.env.WIDGET_ALLOW_ORIGIN ?? '*'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}

export async function POST(request: Request) {
  let payload: { phoneNumber?: unknown }
  try {
    payload = (await request.json()) as { phoneNumber?: unknown }
  } catch {
    return Response.json(
      { error: 'Invalid phone number' },
      { status: 400, headers: corsHeaders() }
    )
  }

  const ip = clientIpFromHeaders((name) => request.headers.get(name))
  const result = await handleOutboundCall({
    phoneNumber: payload.phoneNumber,
    ip,
    env: envFromProcess(),
  })

  return Response.json(result.body, { status: result.status, headers: corsHeaders() })
}
