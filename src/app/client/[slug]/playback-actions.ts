'use server'
import { headers } from 'next/headers'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { isPlaybackErrorCode, summarizeUserAgent } from '@/lib/portal/piece-page/playback-failure'
import { createSupabaseServer } from '@/lib/supabase/server'

const PREVIEW_KEY = /^[a-z0-9][a-z0-9_-]{0,63}$/

// A review video failed for the signed-in seat (migration 0094, amended 2026-10-03). Records it with
// the seat's own session; the database checks the seat, the released version and the preview,
// rate-limits, and tells the agency once per preview per day. Only a device and browser name from
// fixed lists leaves this function, never the raw user agent. ok:true means the agency knows (a
// rate-limited repeat included); the player then tells her "I've been notified."
export async function reportReviewPlaybackFailure(input: {
  slug: string
  contentId: string
  contentVersion: number
  previewKey: string
  errorCode: string
}): Promise<{ ok: boolean }> {
  if (!isPlaybackErrorCode(input.errorCode) || !PREVIEW_KEY.test(input.previewKey)
      || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) return { ok: false }
  const session = await getClientSession(input.slug)
  if (!session) return { ok: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item || item.version !== input.contentVersion) return { ok: false }
  const { device, browser } = summarizeUserAgent((await headers()).get('user-agent'))
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('report_review_playback_failure', {
    p_content_id: item.id, p_content_version: input.contentVersion, p_preview_key: input.previewKey,
    p_error_code: input.errorCode, p_device: device, p_browser: browser,
  })
  return { ok: !error }
}
