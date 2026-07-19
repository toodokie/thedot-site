import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      clientId?: string; kind?: 'reviewed_link' | 'agency_attestation' | 'yt_check'
      url?: string; note?: string; capturedAt?: string; idempotencyKey?: string
    }
    if (!body.clientId?.match(/^[0-9a-f-]{36}$/i)
      || !body.kind || !['reviewed_link', 'agency_attestation', 'yt_check'].includes(body.kind)
      || !body.idempotencyKey?.match(/^[A-Za-z0-9:_-]{8,128}$/)) {
      return NextResponse.json({ error: 'Invalid evidence.' }, { status: 400 })
    }
    if (body.kind === 'agency_attestation') {
      if (!body.note || body.note.trim().length < 10 || body.url) {
        return NextResponse.json({ error: 'An agency attestation needs a clear note.' }, { status: 400 })
      }
    } else {
      try {
        const url = new URL(body.url ?? '')
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error()
      } catch {
        return NextResponse.json({ error: 'Evidence link must be a safe HTTPS URL.' }, { status: 400 })
      }
    }
    const admin = createSupabaseAdmin()
    const { data: evidenceId, error } = await admin.rpc('register_publication_evidence', {
      p_client_id: body.clientId,
      p_actor_key: 'thedot-admin',
      p_evidence_kind: body.kind,
      p_object_key: null,
      p_evidence_url: body.kind === 'agency_attestation' ? null : body.url,
      p_attestation_note: body.kind === 'agency_attestation' ? body.note : null,
      p_captured_at: body.capturedAt ?? new Date().toISOString(),
      p_sha256: null,
      p_mime_type: null,
      p_byte_length: null,
      p_idempotency_key: body.idempotencyKey,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ evidenceId })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message === 'ADMIN_AUTH_REQUIRED' ? 'Unauthorized' : 'Evidence registration failed.' },
      { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 500 },
    )
  }
}
