import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// Agency-only billing operations. Financial fields are immutable after issuance (issue new invoices
// via portal-write); this route only toggles status and attaches the invoice document. The RPCs are
// service-definer + idempotent; the effective actor is the fixed 'thedot-admin' agency actor.
const UUID = /^[0-9a-f-]{36}$/i
const IDEMPOTENCY = /^[A-Za-z0-9:_-]{8,128}$/

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      operation?: 'set_status' | 'attach_document'
      clientId?: string; invoiceId?: string; idempotencyKey?: string
      status?: string; documentUrl?: string | null; documentObjectKey?: string | null
    }
    if (!body.clientId?.match(UUID) || !body.invoiceId?.match(UUID)
      || !body.idempotencyKey?.match(IDEMPOTENCY)) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()

    if (body.operation === 'set_status') {
      if (!body.status || !['paid', 'unpaid', 'void'].includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
      }
      const { data, error } = await admin.rpc('set_invoice_status', {
        p_client_id: body.clientId,
        p_invoice_id: body.invoiceId,
        p_status: body.status,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: data })
    }

    if (body.operation === 'attach_document') {
      const { data, error } = await admin.rpc('attach_invoice_document', {
        p_client_id: body.clientId,
        p_invoice_id: body.invoiceId,
        p_document_url: body.documentUrl ?? null,
        p_document_object_key: body.documentObjectKey ?? null,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: data })
    }

    return NextResponse.json({ error: 'Unknown operation.' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
