import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    await requireAdminSession(); assertSameOriginRequest(request)
    const body = await request.json() as { action?: 'link'|'ignore'; unmappedId?: string; contentId?: string; contentVersion?: number; note?: string; idempotencyKey?: string }
    if (!body.unmappedId?.match(/^[0-9a-f-]{36}$/i) || !body.note
      || !['link','ignore'].includes(body.action ?? '')) {
      return NextResponse.json({ error: 'Invalid reviewed event mapping.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    if (body.action === 'ignore') {
      const { error } = await admin.rpc('ignore_calendar_unmapped_event', {
        p_unmapped_id: body.unmappedId, p_note: body.note,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: 'ignored' })
    }
    if (!body.contentId?.match(/^[0-9a-f-]{36}$/i) || !Number.isInteger(body.contentVersion)
      || !body.idempotencyKey?.match(/^[A-Za-z0-9:_-]{8,128}$/)) {
      return NextResponse.json({ error: 'Invalid reviewed event mapping.' }, { status: 400 })
    }
    const { data, error } = await admin.rpc('link_calendar_unmapped_event', {
      p_unmapped_id: body.unmappedId, p_content_id: body.contentId,
      p_content_version: body.contentVersion, p_note: body.note,
      p_idempotency_key: body.idempotencyKey,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Event mapping failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
