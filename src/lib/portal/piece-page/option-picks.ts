import 'server-only'
import { createSupabaseServer } from '@/lib/supabase/server'
import { carriedOptionPicks, type OptionPick } from '../review-asset-options'

// The seat's own option picks for one version (migration 0098), carried from earlier versions, read with the seat's session so
// RLS returns only its rows. A failed read shows no "Chosen" mark rather than failing the page.
export async function getMyReviewOptionPicks(contentItemId: string, contentVersion: number): Promise<OptionPick[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_option_picks').select('option_group, asset_key, content_version, picked_at')
    .eq('content_item_id', contentItemId).lte('content_version', contentVersion)
  if (error || !data) return []
  return carriedOptionPicks(data as Array<OptionPick & { content_version: number; picked_at: string }>, contentVersion)
    .map(({ option_group, asset_key }) => ({ option_group, asset_key }))
}
