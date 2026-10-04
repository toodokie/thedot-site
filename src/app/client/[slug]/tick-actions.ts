'use server'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'

const TAB_KEY = /^[a-z0-9][a-z0-9:_-]{0,63}$/

// Records that the seat opened these copy tabs on this version (migration 0094). The database
// accepts ticks only on the released version; a stale page gets ok:false and keeps its local
// ticks until it reloads.
export async function tickReviewTabs(input: {
  slug: string
  contentId: string
  contentVersion: number
  tabKeys: string[]
}): Promise<{ ok: boolean }> {
  const keys = [...new Set(input.tabKeys)].filter((key) => TAB_KEY.test(key)).slice(0, 20)
  if (keys.length === 0 || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) return { ok: false }
  const session = await getClientSession(input.slug)
  if (!session) return { ok: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item || item.version !== input.contentVersion) return { ok: false }
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('tick_review_tabs', {
    p_content_id: item.id, p_content_version: input.contentVersion, p_tab_keys: keys,
  })
  return { ok: !error }
}
