import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf'])
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      clientId?: string; objectKey?: string; capturedAt?: string; idempotencyKey?: string
    }
    if (!body.clientId?.match(/^[0-9a-f-]{36}$/i)
      || !body.objectKey?.startsWith(`${body.clientId}/`)
      || !body.objectKey.match(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/evidence\.(png|jpg|webp|pdf)$/i)
      || !body.idempotencyKey?.match(/^[A-Za-z0-9:_-]{8,128}$/)) {
      return NextResponse.json({ error: 'Invalid evidence finalization.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const { data: blob, error: downloadError } = await admin.storage
      .from('portal-publication-evidence').download(body.objectKey)
    if (downloadError || !blob) throw new Error(downloadError?.message ?? 'Uploaded object missing')
    const bytes = Buffer.from(await blob.arrayBuffer())
    const signature = bytes.subarray(0, 12).toString('hex')
    const signatureMatches = blob.type === 'image/png' ? signature.startsWith('89504e470d0a1a0a')
      : blob.type === 'image/jpeg' ? signature.startsWith('ffd8ff')
      : blob.type === 'image/webp'
        ? bytes.subarray(0, 4).toString('ascii') === 'RIFF'
          && bytes.subarray(8, 12).toString('ascii') === 'WEBP'
        : blob.type === 'application/pdf' ? bytes.subarray(0, 5).toString('ascii') === '%PDF-' : false
    if (!TYPES.has(blob.type) || !signatureMatches || bytes.length < 1 || bytes.length > MAX_BYTES) {
      await admin.storage.from('portal-publication-evidence').remove([body.objectKey])
      return NextResponse.json({ error: 'Uploaded evidence type or size is invalid.' }, { status: 400 })
    }
    const kind = blob.type === 'application/pdf' ? 'pdf' : 'screenshot'
    const { data: evidenceId, error } = await admin.rpc('register_publication_evidence', {
      p_client_id: body.clientId,
      p_actor_key: 'thedot-admin',
      p_evidence_kind: kind,
      p_object_key: body.objectKey,
      p_evidence_url: null,
      p_attestation_note: null,
      p_captured_at: body.capturedAt ?? new Date().toISOString(),
      p_sha256: createHash('sha256').update(bytes).digest('hex'),
      p_mime_type: blob.type,
      p_byte_length: bytes.length,
      p_idempotency_key: body.idempotencyKey,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ evidenceId })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message === 'ADMIN_AUTH_REQUIRED' ? 'Unauthorized' : 'Evidence finalization failed.' },
      { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 500 },
    )
  }
}
