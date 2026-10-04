import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import {
  clientSignalFromRow, type ClientSignal, type OpenClientSignalRow, type SentDraftAnchorRow,
} from './agency-ops-core'

// Agency Ops readers (migration 0095). Service role only; never imported by a client route.

const ACTOR_KEY = 'thedot-admin'

export async function getOpenClientSignals(limit = 100): Promise<ClientSignal[]> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_open_client_signals', { p_limit: limit })
  if (error) throw new Error(`client signals unavailable: ${error.message}`)
  return ((data ?? []) as OpenClientSignalRow[])
    .map(clientSignalFromRow)
    .filter((signal): signal is ClientSignal => signal !== null)
}

export async function resolveClientSignal(input: {
  eventId: string
  note: string | null
  idempotencyKey: string
}): Promise<{ outcome: 'resolved' | 'already_resolved' }> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_resolve_inbox_event', {
    p_event_id: input.eventId, p_note: input.note, p_actor_key: ACTOR_KEY,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) throw new Error(error.message)
  return { outcome: (data as { outcome?: string } | null)?.outcome === 'already_resolved' ? 'already_resolved' : 'resolved' }
}

export type FeedbackSummary = {
  seatName: string
  rating: number
  comment: string | null
  createdAt: string
  promptKey: string
}

export async function getLatestFeedback(clientId: string, limit = 3): Promise<FeedbackSummary[]> {
  const { data, error } = await createSupabaseAdmin().from('portal_feedback_responses')
    .select('seat_name, rating, comment, created_at, prompt_key')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(`feedback unavailable: ${error.message}`)
  return ((data ?? []) as Array<{ seat_name: string; rating: number; comment: string | null; created_at: string; prompt_key: string }>)
    .map((row) => ({ seatName: row.seat_name, rating: row.rating, comment: row.comment,
      createdAt: row.created_at, promptKey: row.prompt_key }))
}

export type PieceRequestContext = {
  bundles: Array<{ id: string; request_ids: string[] }>
  sentDrafts: SentDraftAnchorRow[]
  versions: Array<{ version: number; synced_at: string | null }>
}

// What the admin piece page needs beyond plan 3's readers: the bundles (to map a request to its
// sent drafts), the sent drafts' frame anchors, and every version's sync date.
export async function getPieceRequestContext(clientId: string, contentItemId: string): Promise<PieceRequestContext> {
  const admin = createSupabaseAdmin()
  const [bundles, drafts, versions] = await Promise.all([
    admin.from('content_edit_review_bundles').select('id, request_ids')
      .eq('client_id', clientId).eq('content_id', contentItemId).limit(200),
    admin.from('content_review_drafts').select('sent_bundle_id, target_kind, target_key, anchor, anchor_label')
      .eq('client_id', clientId).eq('content_item_id', contentItemId).eq('status', 'sent').limit(500),
    admin.from('content_item_versions').select('version, synced_at')
      .eq('client_id', clientId).eq('content_item_id', contentItemId).order('version', { ascending: false }).limit(50),
  ])
  const failure = bundles.error ?? drafts.error ?? versions.error
  if (failure) throw new Error(`piece request context unavailable: ${failure.message}`)
  return {
    bundles: (bundles.data ?? []) as PieceRequestContext['bundles'],
    sentDrafts: (drafts.data ?? []) as SentDraftAnchorRow[],
    versions: (versions.data ?? []) as PieceRequestContext['versions'],
  }
}
