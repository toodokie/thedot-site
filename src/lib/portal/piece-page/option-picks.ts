import 'server-only'
import { createSupabaseServer } from '@/lib/supabase/server'
import type { OptionPick } from '../review-asset-options'

// The seat's own option picks for one version (migration 0098), read with the seat's session so
// RLS returns only its rows. A failed read shows no "Chosen" mark rather than failing the page.
export async function getMyReviewOptionPicks(contentItemId: string, contentVersion: number): Promise<OptionPick[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_option_picks').select('option_group, asset_key')
    .eq('content_item_id', contentItemId).eq('content_version', contentVersion)
  if (error || !data) return []
  return data as OptionPick[]
}
