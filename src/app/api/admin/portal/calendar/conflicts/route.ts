import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    await requireAdminSession(); assertSameOriginRequest(request)
    const body = await request.json() as { conflictId?: string; resolution?: string; note?: string; idempotencyKey?: string }
    if (!body.conflictId?.match(/^[0-9a-f-]{36}$/i) || !['portal','google'].includes(body.resolution ?? '')
      || !body.note || !body.idempotencyKey?.match(/^[A-Za-z0-9:_-]{8,128}$/)) {
      return NextResponse.json({ error: 'Invalid conflict resolution.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.rpc('resolve_calendar_sync_conflict', {
      p_conflict_id: body.conflictId, p_resolution: body.resolution,
      p_note: body.note, p_idempotency_key: body.idempotencyKey,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Conflict resolution failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
