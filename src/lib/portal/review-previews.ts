import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  REVIEW_PREVIEW_COLUMNS, signReviewPreview, signReviewPreviews,
  type ReviewPreviewRow, type SignedReviewPreview,
} from './review-preview-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Client reads go through the seat's own session, so RLS (migration 0092) decides what she may
// see: her tenant only, the released version only, never an archived piece. Only after RLS has
// returned the row does the service role sign its object paths. Storage itself has no client
// policy at all, so a seat can never fetch an object without passing through here.
export async function getClientReviewPreviews(
  clientId: string,
  contentItemId: string,
  contentVersion: number,
): Promise<SignedReviewPreview[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('client_id', clientId)
    .eq('content_item_id', contentItemId)
    .eq('content_version', contentVersion)
    .order('preview_key')
  if (error) throw new Error(`Could not load review previews: ${error.message}`)
  const rows = (data ?? []) as unknown as ReviewPreviewRow[]
  if (rows.length === 0) return []
  return signReviewPreviews(createSupabaseAdmin().storage, rows)
}

export async function getClientReviewPreviewById(
  clientId: string,
  previewId: string,
): Promise<SignedReviewPreview | null> {
  if (!UUID.test(previewId)) return null
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('client_id', clientId)
    .eq('id', previewId)
    .maybeSingle()
  if (error) throw new Error(`Could not load review preview: ${error.message}`)
  if (!data) return null
  return signReviewPreview(createSupabaseAdmin().storage, data as unknown as ReviewPreviewRow)
}

// Agency reads: any version, including a working version the client has not seen yet.
export async function getAgencyReviewPreviews(
  contentItemId: string,
  contentVersion: number,
): Promise<SignedReviewPreview[]> {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('content_item_id', contentItemId)
    .eq('content_version', contentVersion)
    .order('preview_key')
  if (error) throw new Error(`Could not load review previews: ${error.message}`)
  const rows = (data ?? []) as unknown as ReviewPreviewRow[]
  if (rows.length === 0) return []
  return signReviewPreviews(admin.storage, rows)
}

export async function getAgencyReviewPreviewById(previewId: string): Promise<SignedReviewPreview | null> {
  if (!UUID.test(previewId)) return null
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.from('content_review_previews')
    .select(REVIEW_PREVIEW_COLUMNS)
    .eq('id', previewId)
    .maybeSingle()
  if (error) throw new Error(`Could not load review preview: ${error.message}`)
  if (!data) return null
  return signReviewPreview(admin.storage, data as unknown as ReviewPreviewRow)
}
