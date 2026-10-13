import { NextResponse } from 'next/server'
import { assertSameOriginRequest, requireAdminSession } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const CONTENT_ID = /^[a-z0-9][a-z0-9._-]{0,199}$/
const IDEMPOTENCY = /^[A-Za-z0-9:_-]{8,128}$/

function validDate(value: string) {
  if (!DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      clientSlug?: unknown
      contentId?: unknown
      plannedDate?: unknown
      idempotencyKey?: unknown
    }
    const clientSlug = typeof body.clientSlug === 'string' ? body.clientSlug.trim() : ''
    const contentId = typeof body.contentId === 'string' ? body.contentId.trim() : ''
    const plannedDate = body.plannedDate === null ? null : typeof body.plannedDate === 'string' ? body.plannedDate : undefined
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : ''
    if (!clientSlug || clientSlug.length > 100 || !CONTENT_ID.test(contentId)
        || plannedDate === undefined || (plannedDate !== null && !validDate(plannedDate))
        || !IDEMPOTENCY.test(idempotencyKey)) {
      return NextResponse.json({ error: 'Invalid plan date.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const client = await admin.from('clients').select('id').eq('slug', clientSlug).single()
    if (client.error || !client.data) throw new Error('Client not found')
    const result = await admin.rpc('agency_set_content_plan_date', {
      p_client_id: client.data.id,
      p_content_id: contentId,
      p_planned_date: plannedDate,
      p_note: null,
      p_actor_key: 'thedot-admin',
      p_idempotency_key: idempotencyKey,
    })
    if (result.error) throw new Error(result.error.message)
    return NextResponse.json({ result: result.data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan date update failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, {
      status, headers: { 'Cache-Control': 'private, no-store' },
    })
  }
}
