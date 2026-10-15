import { getStore } from '@netlify/blobs'
import { timingSafeEqual } from 'node:crypto'

const COMMAND_TTL_MS = 30_000
const COOLDOWN_MS = 8_000

const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
})

const authorised = (request) => {
  const expected = process.env.GARAGE_API_KEY || ''
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  const a = Buffer.from(expected)
  const b = Buffer.from(supplied)
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b)
}

export default async (request) => {
  if (!authorised(request)) return json({ error: 'Incorrect access key' }, 401)

  const store = getStore('garage-control')
  const state = await store.get('latest-command', { type: 'json' })
  const now = Date.now()

  if (request.method === 'GET') {
    const isDevice = new URL(request.url).searchParams.get('device') === '1'
    if (!isDevice) {
      return json(state || { status: 'idle' })
    }

    if (!state || state.status !== 'pending' || state.expiresAt <= now) {
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
    }

    const claimed = { ...state, status: 'claimed', claimedAt: now }
    await store.setJSON('latest-command', claimed)
    return json({ id: claimed.id, action: 'pulse' })
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const body = await request.json().catch(() => ({}))

  if (body.ack) {
    if (!state || body.ack !== state.id) return json({ error: 'Unknown command' }, 409)
    await store.setJSON('latest-command', { ...state, status: 'completed', completedAt: now })
    return json({ ok: true })
  }

  if (body.action !== 'pulse') return json({ error: 'Unsupported command' }, 400)
  if (state && now - state.issuedAt < COOLDOWN_MS) {
    return json({ error: 'Please wait a few seconds before trying again' }, 429)
  }

  const command = {
    id: crypto.randomUUID(),
    action: 'pulse',
    status: 'pending',
    issuedAt: now,
    expiresAt: now + COMMAND_TTL_MS,
  }
  await store.setJSON('latest-command', command)
  return json({ ok: true, id: command.id }, 202)
}
