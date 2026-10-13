import { randomUUID } from 'node:crypto'
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
      clientId?: string; fileName?: string; mimeType?: string; byteLength?: number
    }
    if (!body.clientId?.match(/^[0-9a-f-]{36}$/i) || !body.mimeType
      || !TYPES.has(body.mimeType) || !Number.isInteger(body.byteLength)
      || !body.byteLength || body.byteLength > MAX_BYTES) {
      return NextResponse.json({ error: 'Invalid evidence upload.' }, { status: 400 })
    }
    const extension = body.mimeType === 'application/pdf' ? 'pdf'
      : body.mimeType === 'image/png' ? 'png'
      : body.mimeType === 'image/webp' ? 'webp' : 'jpg'
    const objectId = randomUUID()
    const objectKey = `${body.clientId}/${objectId}/evidence.${extension}`
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.storage
      .from('portal-publication-evidence')
      .createSignedUploadUrl(objectKey, { upsert: false })
    if (error) throw new Error(error.message)
    return NextResponse.json({ objectKey, token: data.token })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return NextResponse.json(
      { error: message === 'ADMIN_AUTH_REQUIRED' ? 'Unauthorized' : 'Evidence upload unavailable.' },
      { status: message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 500 },
    )
  }
}
