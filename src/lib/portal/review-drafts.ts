import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SERVER_DRAFT_COLUMNS, type ServerDraftRow, type UnsentDraftAlert } from './review-drafts-core'

// Readers for durable review drafts (migration 0093).

// The signed-in seat's drafts on one piece, every status, so the browser can tell a draft that is
// still waiting from one another device already sent or discarded. RLS limits this to her own rows.
// Returns null on any failure: the page then falls back to browser-only drafts instead of breaking.
export async function getMyReviewDrafts(contentItemId: string): Promise<ServerDraftRow[] | null> {
  try {
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.from('content_review_drafts').select(SERVER_DRAFT_COLUMNS)
      .eq('content_item_id', contentItemId).order('saved_at', { ascending: false }).limit(500)
    if (error) {
      console.error('review drafts read failed:', error.message)
      return null
    }
    return (data ?? []) as unknown as ServerDraftRow[]
  } catch (error) {
    console.error('review drafts read threw:', error instanceof Error ? error.message : String(error))
    return null
  }
}

export type AgencyReviewDraftRow = ServerDraftRow & {
  client_id: string
  auth_user_id: string
  sent_at: string | null
  discarded_at: string | null
  discard_reason: string | null
  send_attempts: number
}

export const AGENCY_DRAFT_COLUMNS = `${SERVER_DRAFT_COLUMNS}, client_id, auth_user_id, sent_at, discarded_at, discard_reason, send_attempts`

// Agency Ops (plan 5): every seat's drafts on one piece, read-only through service_role.
// Callers must require an admin session (requireAdminSession) first: this bypasses RLS.
export async function getAgencyReviewDrafts(contentItemId: string): Promise<AgencyReviewDraftRow[]> {
  const { data, error } = await createSupabaseAdmin().from('content_review_drafts').select(AGENCY_DRAFT_COLUMNS)
    .eq('content_item_id', contentItemId).order('saved_at', { ascending: false }).limit(500)
  if (error) throw new Error(`review drafts unavailable: ${error.message}`)
  return (data ?? []) as unknown as AgencyReviewDraftRow[]
}

// Agency Ops (plan 5): unsent drafts older than 24 hours on a piece due within 3 days.
// Callers must require an admin session (requireAdminSession) first: this runs as service_role.
export async function getUnsentDraftAlerts(now: Date = new Date()): Promise<UnsentDraftAlert[]> {
  const { data, error } = await createSupabaseAdmin().rpc('agency_unsent_review_draft_alerts', {
    p_now: now.toISOString(),
  })
  if (error) throw new Error(`unsent draft alerts unavailable: ${error.message}`)
  return (data ?? []) as UnsentDraftAlert[]
}
