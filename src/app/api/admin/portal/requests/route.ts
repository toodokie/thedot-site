import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { assertSameOriginRequest, requireAdminSession } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      action?: 'resolve' | 'reply'
      requestId?: string; status?: string; reason?: string; body?: string; close?: boolean; idempotencyKey?: string
    }
    if (body.action === 'reply') {
      const reply = body.body?.trim()
      if (!body.requestId?.match(/^[0-9a-f-]{36}$/i)
          || !reply || reply.length > 4000 || typeof body.close !== 'boolean'
          || !body.idempotencyKey?.match(/^[0-9a-f-]{36}$/i)) {
        return NextResponse.json({ error: 'Invalid request reply.' }, { status: 400 })
      }
      const admin = createSupabaseAdmin()
      const { data, error } = await admin.rpc('reply_to_content_request', {
        p_request_id: body.requestId,
        p_body: reply,
        p_close: body.close,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: data }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (!body.requestId?.match(/^[0-9a-f-]{36}$/i)
        || !['rejected', 'conflicted'].includes(body.status ?? '')
        || !body.reason || body.reason.trim().length < 3 || body.reason.trim().length > 2000
        || !body.idempotencyKey?.match(/^[0-9a-f-]{36}$/i)) {
      return NextResponse.json({ error: 'Invalid request resolution.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.rpc('resolve_content_request', {
      p_request_id: body.requestId,
      p_status: body.status,
      p_reason: body.reason.trim(),
      p_actor_key: 'thedot-admin',
      p_idempotency_key: body.idempotencyKey ?? randomUUID(),
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request resolution failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
