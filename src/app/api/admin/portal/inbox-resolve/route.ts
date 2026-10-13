import { NextResponse } from 'next/server'
import { assertSameOriginRequest, requireAdminSession } from '@/lib/admin-security'
import { SignalNotResolvableError, resolveClientSignal } from '@/lib/portal/agency-ops'

// My Tasks "Done" on a client signal (migration 0095). Agency only; writes one resolution row.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as { eventId?: string; idempotencyKey?: string; note?: string }
    const note = typeof body.note === 'string' ? body.note.trim() || null : null
    if (typeof body.eventId !== 'string' || !UUID.test(body.eventId)
      || typeof body.idempotencyKey !== 'string' || !UUID.test(body.idempotencyKey)
      || (note && note.length > 1000)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers: NO_STORE })
    }
    const result = await resolveClientSignal({ eventId: body.eventId, note, idempotencyKey: body.idempotencyKey })
    return NextResponse.json({ result }, { headers: NO_STORE })
  } catch (error) {
    if (error instanceof SignalNotResolvableError) {
      return NextResponse.json({ error: error.message }, { status: 409, headers: NO_STORE })
    }
    const message = error instanceof Error ? error.message : ''
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    if (status === 400) console.error('inbox resolve failed:', message)
    return NextResponse.json({ error: status === 400 ? 'Could not mark this handled.' : 'Unauthorized' }, { status, headers: NO_STORE })
  }
}
