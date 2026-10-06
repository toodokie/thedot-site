'use server'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'

const ASSET_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/

export type PickOptionResult = { ok: true } | { ok: false; reason: 'invalid' | 'not_allowed' | 'stale' | 'decided' | 'failed' }

// Her choice between alternative covers (migration 0098). The database checks the seat, the
// released version, that the asset is an option and that the piece is not decided yet. A pick is
// a choice, never an edit request: nothing here touches her review or sends her anything.
export async function pickReviewOption(input: {
  slug: string
  contentId: string
  contentVersion: number
  assetKey: string
}): Promise<PickOptionResult> {
  if (!ASSET_KEY.test(input.assetKey) || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) {
    return { ok: false, reason: 'invalid' }
  }
  const session = await getClientSession(input.slug)
  if (!session || !session.canDecide) return { ok: false, reason: 'not_allowed' }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item || item.version !== input.contentVersion) return { ok: false, reason: 'stale' }
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('pick_review_asset_option', {
    p_content_id: item.id, p_content_version: input.contentVersion, p_asset_key: input.assetKey,
  })
  if (error) return { ok: false, reason: /review_option_piece_decided/.test(error.message) ? 'decided' : 'failed' }
  revalidatePath(`/client/${input.slug}/piece/${input.contentId}`)
  return { ok: true }
}
