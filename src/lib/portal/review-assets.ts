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

type ReviewAssetWithOwner = ReviewAsset & { content_item_id: string }

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

export async function getCurrentReviewAssetsByItem(
  clientId: string,
  items: Array<{ id: string; version: number }>,
): Promise<Map<string, ReviewAsset[]>> {
  const assetsByItem = new Map<string, ReviewAsset[]>()
  if (items.length === 0) return assetsByItem

  const currentVersionByItem = new Map(items.map((item) => [item.id, item.version]))
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_review_assets')
    .select('content_item_id, id, content_version, asset_key, label, channel, asset_kind, url, width_px, height_px, caption_status, review_note')
    .eq('client_id', clientId)
    .in('content_item_id', items.map((item) => item.id))
    .order('channel')
    .order('asset_key')
  if (error) throw new Error(`Could not load review assets: ${error.message}`)

  for (const row of (data ?? []) as ReviewAssetWithOwner[]) {
    if (currentVersionByItem.get(row.content_item_id) !== row.content_version) continue
    const { content_item_id: contentItemId, ...asset } = row
    const assets = assetsByItem.get(contentItemId) ?? []
    assets.push(asset)
    assetsByItem.set(contentItemId, assets)
  }
  return assetsByItem
}
