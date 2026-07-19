import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

type Operation =
  | 'confirm_schedule' | 'schedule_failed' | 'confirm_live'
  | 'publication_failed' | 'publication_unavailable' | 'publication_removed'
const OPERATIONS = new Set<Operation>([
  'confirm_schedule', 'schedule_failed', 'confirm_live', 'publication_failed',
  'publication_unavailable', 'publication_removed',
])

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as {
      operation?: Operation; targetId?: string; evidenceId?: string; idempotencyKey?: string
      providerUrl?: string; actualAt?: string; externalId?: string; visibility?: string
      observedTitle?: string; observedText?: string; note?: string
    }
    if (!body.operation || !OPERATIONS.has(body.operation)
      || !body.targetId?.match(/^[0-9a-f-]{36}$/i)
      || !body.evidenceId?.match(/^[0-9a-f-]{36}$/i)
      || !body.idempotencyKey?.match(/^[A-Za-z0-9:_-]{8,128}$/)) {
      return NextResponse.json({ error: 'Invalid operation.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    if (body.operation === 'confirm_schedule') {
      const { data, error } = await admin.rpc('confirm_schedule_target', {
        p_schedule_target_id: body.targetId,
        p_scheduled_at: body.actualAt,
        p_external_url: body.providerUrl,
        p_external_id: body.externalId ?? null,
        p_evidence_id: body.evidenceId,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: data })
    }
    if (body.operation === 'schedule_failed') {
      const { data, error } = await admin.rpc('mark_schedule_target_failed', {
        p_schedule_target_id: body.targetId,
        p_error: body.note,
        p_evidence_id: body.evidenceId,
        p_actor_key: 'thedot-admin',
        p_idempotency_key: body.idempotencyKey,
      })
      if (error) throw new Error(error.message)
      return NextResponse.json({ result: data })
    }
    const { data: target, error: targetError } = await admin.from('content_publication_targets')
      .select('current_observation_id').eq('id', body.targetId).single()
    if (targetError || !target) throw new Error('Publication target not found')
    const providerState = body.operation === 'confirm_live' ? 'live'
      : body.operation === 'publication_removed' ? 'removed'
      : body.operation === 'publication_unavailable' ? 'unavailable' : 'failed'
    const { data, error } = await admin.rpc('record_publication_observation', {
      p_publication_target_id: body.targetId,
      p_provider_state: providerState,
      p_live_url: body.providerUrl ?? null,
      p_published_at: body.actualAt ?? null,
      p_visibility: body.visibility ?? 'public',
      p_evidence_id: body.evidenceId,
      p_actor_key: 'thedot-admin',
      p_source_type: 'manual',
      p_reconciliation_status: 'verified',
      p_provider_object_id: body.externalId ?? null,
      p_observed_title: body.observedTitle ?? null,
      p_observed_text: body.observedText ?? null,
      p_observation_key: body.idempotencyKey,
      p_supersedes_observation_id: target.current_observation_id,
      p_verification_note: body.note ?? null,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ result: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Operation failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
