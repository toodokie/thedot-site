import 'server-only'
import { createSupabaseServer } from '@/lib/supabase/server'

// The seat's ticks for one version (migration 0094), read with the seat's own session so RLS
// returns only its rows. Ticks are a reading aid: a failed read starts at zero instead of
// failing the page, and the browser copy in ReviewTicksProvider fills the gap.
export async function getMyReviewTicks(contentItemId: string, contentVersion: number): Promise<string[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('content_review_tab_ticks').select('tab_key')
    .eq('content_item_id', contentItemId).eq('content_version', contentVersion)
  if (error || !data) return []
  return (data as Array<{ tab_key: string }>).map((row) => row.tab_key)
}
