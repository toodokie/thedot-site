import { createSupabaseServer } from '@/lib/supabase/server'

export type ReviewAsset = {
  id: string
  content_version: number
  asset_key: string
  label: string
  channel: 'social' | 'youtube' | 'website'
  asset_kind: 'cover' | 'video' | 'document'
  url: string
  width_px: number
  height_px: number
  caption_status: 'not_applicable' | 'burned_in_pending' | 'burned_in_verified'
  review_note: string | null
}

export async function getReviewAssets(
  clientId: string,
  contentItemId: string,
  contentVersion: number,
): Promise<ReviewAsset[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_review_assets')
    .select('id, content_version, asset_key, label, channel, asset_kind, url, width_px, height_px, caption_status, review_note')
    .eq('client_id', clientId)
    .eq('content_item_id', contentItemId)
    .eq('content_version', contentVersion)
    .order('channel')
    .order('asset_key')
  if (error) throw new Error(`Could not load review assets: ${error.message}`)
  return (data ?? []) as ReviewAsset[]
}
