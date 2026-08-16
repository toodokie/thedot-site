'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'
import { REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'

export type RequestActionState = { error?: string; success?: string }
export type ReviewBundleDraft = {
  targetKind: 'copy_block' | 'asset' | 'design_link'
  targetKey: string
  targetLabel: string
  proposedText: string
  urlSnapshot?: string | null
}

export type ReviewBundleResult = RequestActionState & { requestIds?: string[] }

function textField(data: FormData, key: string): string | null {
  const value = data.get(key)
  return typeof value === 'string' ? value : null
}

function validKey(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))
}

function responseOutcome(data: unknown): string | null {
  return data && typeof data === 'object' && 'outcome' in data
    ? String((data as { outcome?: unknown }).outcome ?? '') : null
}

async function requestContext(data: FormData) {
  const slug = textField(data, 'slug')
  if (!slug) return null
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  return { slug, session }
}

export async function sendReviewBundle(input: {
  slug: string
  contentId: string
  contentVersion: number
  drafts: ReviewBundleDraft[]
  note?: string
  idempotencyKey: string
}): Promise<ReviewBundleResult> {
  const session = await getClientSession(input.slug)
  if (!session) redirect('/client/login')
  if (!session.canSubmitRequests) return { error: 'Your account cannot send edits.' }
  if (!validKey(input.idempotencyKey) || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) {
    return { error: 'This review expired. Reload the page and try again.' }
  }
  if (!Array.isArray(input.drafts) || input.drafts.length < 1 || input.drafts.length > 50) {
    return { error: 'Add at least one edit before sending.' }
  }
  const seen = new Set<string>()
  for (const draft of input.drafts) {
    const identity = `${draft.targetKind}:${draft.targetKey}`
    if (!['copy_block', 'asset', 'design_link'].includes(draft.targetKind)
        || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(draft.targetKey)
        || !draft.targetLabel?.trim() || draft.targetLabel.trim().length > 120
        || !draft.proposedText?.trim() || draft.proposedText.trim().length > 8000
        || seen.has(identity)) {
      return { error: 'One of the edits is incomplete. Review it and try again.' }
    }
    if (draft.urlSnapshot && (!/^https:\/\/[^\s]+$/i.test(draft.urlSnapshot) || draft.urlSnapshot.length > 2048)) {
      return { error: 'One of the visual references is no longer valid. Reload the page and try again.' }
    }
    seen.add(identity)
  }
  const note = input.note?.trim() ?? ''
  if (note.length > 2000) return { error: 'The overall note is too long (2,000 characters max).' }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return { error: 'That piece is no longer available.' }
  if (item.version !== input.contentVersion) {
    return { error: 'A newer version is ready. Reload the page before sending edits.' }
  }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('request_content_edit_bundle', {
    p_content_id: item.id,
    p_content_version: input.contentVersion,
    p_edits: input.drafts.map((draft) => ({
      target_kind: draft.targetKind,
      target_key: draft.targetKey,
      target_label: draft.targetLabel.trim(),
      proposed_text: draft.proposedText.trim(),
      url_snapshot: draft.urlSnapshot || null,
    })),
    p_note: note || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) {
    if (error.message.includes('revision_already_in_progress')) {
      return { error: 'The Dot has started this revision. Your saved edits were not sent. Please review the updated version when it returns.' }
    }
    if (error.message.includes('stale') || error.message.includes('locked')) {
      return { error: 'This version changed while you were reviewing it. Reload to see the current package.' }
    }
    if (error.message.includes('rate_limited')) {
      return { error: 'Too many requests were submitted. Please try again in an hour.' }
    }
    return { error: 'Your edits could not be sent. They are still saved in this browser. Please try again.' }
  }
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  revalidatePath(`/client/${input.slug}`)
  revalidatePath(`/client/${input.slug}/requests`)
  revalidatePath(`/client/${input.slug}/piece/${input.contentId}`)
  return {
    success: input.drafts.length === 1 ? 'Your edit was sent to The Dot.' : `Your ${input.drafts.length} edits were sent to The Dot.`,
    requestIds: Array.isArray(result.request_ids) ? result.request_ids.filter((id): id is string => typeof id === 'string') : [],
  }
}

export async function acknowledgeReviewFlowAnnouncement(slug: string): Promise<void> {
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const supabase = await createSupabaseServer()
  await supabase.rpc('acknowledge_portal_announcement', {
    p_client_id: session.clientId,
    p_announcement_key: REVIEW_FLOW_ANNOUNCEMENT_KEY,
  })
}

export async function suggestContentEdit(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requestContext(formData)
  const contentId = textField(formData, 'contentId')
  const blockKey = textField(formData, 'blockKey')
  const proposedText = (textField(formData, 'proposedText') ?? '').trim()
  const idempotencyKey = textField(formData, 'idempotencyKey')
  if (!context || !contentId || !blockKey || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(blockKey)
      || !validKey(idempotencyKey)) return { error: 'This form expired. Please reload and try again.' }
  if (!context.session.canSubmitRequests) return { error: 'Your account cannot submit content requests.' }
  if (!proposedText) return { error: 'Add the copy you would like us to use.' }
  if (proposedText.length > 8000) return { error: 'The proposed copy is too long (8,000 characters max).' }
  const item = await getContentItem(context.session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }
  const block = item.copy_blocks.find((candidate) => candidate.key === blockKey)
  if (!block) return { error: 'That copy block changed. Reload the page before suggesting an edit.' }
  if (block.body.trim() === proposedText) return { error: 'The proposed copy is unchanged.' }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('request_content_edit', {
    p_content_id: item.id,
    p_content_version: item.version,
    p_block_key: blockKey,
    p_proposed_text: proposedText,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    if (error.message.includes('already_open')) return { error: 'An edit for this copy block is already in progress.' }
    if (error.message.includes('stale') || error.message.includes('copy_block')) {
      return { error: 'This copy changed. Reload the page and review the latest version.' }
    }
    return { error: 'Could not save the edit request. Please try again.' }
  }
  if (responseOutcome(data) === 'rate_limited') {
    return { error: 'Too many requests were submitted. Please try again in an hour.' }
  }
  revalidatePath(`/client/${context.slug}`)
  revalidatePath(`/client/${context.slug}/requests`)
  revalidatePath(`/client/${context.slug}/piece/${contentId}`)
  return { success: 'Edit suggestion received. The released copy has not changed yet.' }
}

export async function replyToContentRequest(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requestContext(formData)
  const requestId = textField(formData, 'requestId')
  const body = (textField(formData, 'body') ?? '').trim()
  const idempotencyKey = textField(formData, 'idempotencyKey')
  if (!context || !requestId || !validKey(requestId) || !validKey(idempotencyKey)) {
    return { error: 'This form expired. Please reload and try again.' }
  }
  if (!context.session.canSubmitRequests) return { error: 'Your account cannot reply to content requests.' }
  if (!body || body.length > 4000) return { error: 'Write a reply of no more than 4,000 characters.' }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('reply_to_content_request_as_client', {
    p_request_id: requestId,
    p_body: body,
    p_idempotency_key: idempotencyKey,
  })
  if (error) return { error: 'Could not send the reply. Please reload and try again.' }
  if (responseOutcome(data) === 'rate_limited') return { error: 'Too many replies were sent. Please try again in an hour.' }
  revalidatePath(`/client/${context.slug}`)
  revalidatePath(`/client/${context.slug}/requests`)
  return { success: 'Reply sent to The Dot.' }
}

export async function requestNewContent(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requestContext(formData)
  const title = (textField(formData, 'title') ?? '').trim()
  const brief = (textField(formData, 'brief') ?? '').trim()
  const notes = (textField(formData, 'notes') ?? '').trim()
  const desiredDate = textField(formData, 'desiredDate')
  const idempotencyKey = textField(formData, 'idempotencyKey')
  const platforms = formData.getAll('platforms').filter((value): value is string => typeof value === 'string')
  const allowed = new Set(['instagram', 'facebook', 'youtube', 'linkedin', 'squarespace', 'other'])
  if (!context || !validKey(idempotencyKey)) return { error: 'This form expired. Please reload and try again.' }
  if (!context.session.canSubmitRequests) return { error: 'Your account cannot submit content requests.' }
  if (!title || title.length > 300) return { error: 'Add a title of no more than 300 characters.' }
  if (!brief || brief.length > 4000) return { error: 'Add a brief of no more than 4,000 characters.' }
  if (notes.length > 2000) return { error: 'Notes must be no more than 2,000 characters.' }
  if (!platforms.length || platforms.length > 5 || platforms.some((value) => !allowed.has(value))) {
    return { error: 'Choose at least one valid destination.' }
  }
  if (!desiredDate || !/^\d{4}-\d{2}-\d{2}$/.test(desiredDate)) {
    return { error: 'Choose a valid desired date.' }
  }
  const date = new Date(`${desiredDate}T00:00:00Z`)
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== desiredDate) {
    return { error: 'Choose a real calendar date.' }
  }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('request_content_create', {
    p_client_id: context.session.clientId,
    p_title: title,
    p_brief: brief,
    p_platforms: [...new Set(platforms)],
    p_desired_date: desiredDate,
    p_notes: notes || null,
    p_idempotency_key: idempotencyKey,
  })
  if (error) return { error: 'Could not save the new-piece request. Please review the fields and try again.' }
  if (responseOutcome(data) === 'rate_limited') {
    return { error: 'Too many requests were submitted. Please try again in an hour.' }
  }
  revalidatePath(`/client/${context.slug}`)
  revalidatePath(`/client/${context.slug}/requests`)
  return { success: 'Request received. It will stay visible here while The Dot prepares it.' }
}

export async function requestContentRemoval(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const context = await requestContext(formData)
  const contentId = textField(formData, 'contentId')
  const reason = (textField(formData, 'reason') ?? '').trim()
  const confirmation = textField(formData, 'confirm')
  const idempotencyKey = textField(formData, 'idempotencyKey')
  if (!context || !contentId || !validKey(idempotencyKey)) {
    return { error: 'This form expired. Please reload and try again.' }
  }
  if (!context.session.canSubmitRequests) return { error: 'Your account cannot submit content requests.' }
  if (confirmation !== 'yes') return { error: 'Confirm that you want The Dot to review this removal request.' }
  if (reason.length > 2000) return { error: 'The reason is too long (2,000 characters max).' }
  const item = await getContentItem(context.session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('request_content_archive', {
    p_content_id: item.id,
    p_content_version: item.version,
    p_reason: reason || null,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    if (error.message.includes('already_open')) return { error: 'A removal request is already in progress.' }
    return { error: 'Could not save the removal request. Please try again.' }
  }
  if (responseOutcome(data) === 'rate_limited') {
    return { error: 'Too many requests were submitted. Please try again in an hour.' }
  }
  revalidatePath(`/client/${context.slug}`)
  revalidatePath(`/client/${context.slug}/requests`)
  revalidatePath(`/client/${context.slug}/piece/${contentId}`)
  return { success: 'Removal request received. The piece remains available until it is reconciled.' }
}
