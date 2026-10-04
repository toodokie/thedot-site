'use server'

import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { FEEDBACK_COMMENT_MAX, FEEDBACK_PROMPT_KEY } from '@/lib/portal/portal-feedback'
import { FEEDBACK_CARD_COPY } from '@/lib/portal/piece-page-announcement'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type FeedbackResult = { ok: true } | { ok: false; error: string }

// Spec 9.1. The seat's own JWT calls the RPC, so membership, the portal switches and the
// one-per-seat rule are enforced in the database (migration 0095). Never emails the client.
// The rollout note's receipt is plan 4a's acknowledgePiecePageIntro (request-actions.ts), same key.
export async function submitPortalFeedback(slug: string, input: {
  rating: number
  comment: string
  contentItemId: string | null
}): Promise<FeedbackResult> {
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const comment = input.comment.trim()
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 || comment.length > FEEDBACK_COMMENT_MAX) {
    return { ok: false, error: FEEDBACK_CARD_COPY.failed }
  }
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('submit_portal_feedback', {
    p_client_id: session.clientId,
    p_prompt_key: FEEDBACK_PROMPT_KEY,
    p_rating: input.rating,
    p_comment: comment || null,
    p_content_item_id: input.contentItemId && UUID.test(input.contentItemId) ? input.contentItemId : null,
  })
  if (error) {
    console.error('feedback submit failed:', error.message)
    return { ok: false, error: FEEDBACK_CARD_COPY.failed }
  }
  return { ok: true }
}
