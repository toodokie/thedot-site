'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'
import { REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'
import { recordRefusal, type RefusalReason, type RefusedDraft } from '@/lib/portal/refusal-log'

// Must stay in step with migration 0088, which raised the same bound in four database
// functions, and with the form's maxLength. 0088 fixed the database and the form and
// missed this server action in between, so a long-form edit passed validation at both
// ends and was refused here. That is why Maria still could not send edits on the ep3
// article, 15,483 characters, four days after the cap was supposedly lifted.
const MAX_PROPOSED_TEXT = 50000

export type RequestActionState = { error?: string; success?: string }

// Every refusal on a path that carries the client's own copy goes through here, so the attempt and
// her wording survive somewhere we can see. Returning the error is its whole job, which is what
// makes the "no bare return { error }" rule in refusal-logging.test.ts enforceable: a new refusal
// path that forgets to log fails that test instead of silently losing her work. Logging can never
// change what the caller gets back.
async function refuse(
  message: string,
  reason: RefusalReason,
  context: {
    clientId: string
    contentItemId?: string | null
    contentId?: string | null
    contentVersion?: number | null
    requestedBy?: string | null
    requesterName?: string | null
    drafts?: RefusedDraft[]
  },
): Promise<RequestActionState> {
  await recordRefusal({ ...context, reason, clientMessage: message })
  return { error: message }
}
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
  const bundle = {
    clientId: session.clientId,
    contentId: input.contentId,
    contentVersion: input.contentVersion,
    requestedBy: session.userId,
    requesterName: session.name,
    drafts: Array.isArray(input.drafts) ? input.drafts : [],
  }
  if (!session.canSubmitRequests) {
    return refuse('Your account cannot send edits.', 'cannot_submit_requests', bundle)
  }
  if (!validKey(input.idempotencyKey) || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) {
    return refuse('This review expired. Reload the page and try again.', 'expired_review', bundle)
  }
  if (!Array.isArray(input.drafts) || input.drafts.length < 1 || input.drafts.length > 50) {
    return refuse('Add at least one edit before sending.', 'empty_bundle', bundle)
  }
  const seen = new Set<string>()
  for (const draft of input.drafts) {
    const identity = `${draft.targetKind}:${draft.targetKey}`
    // Length gets its own message. "One of the edits is incomplete. Review it and try again" was
    // what Maria saw when the article was too long: it names no cause and invites her to send the
    // identical thing again, which is roughly what happened.
    if (draft.proposedText && draft.proposedText.trim().length > MAX_PROPOSED_TEXT) {
      return refuse(
        `One of the edits is too long (${MAX_PROPOSED_TEXT.toLocaleString('en-CA')} characters max, `
          + `"${draft.targetLabel?.trim() || draft.targetKey}" is `
          + `${draft.proposedText.trim().length.toLocaleString('en-CA')}). `
          + 'We have your text and will be in touch.',
        'draft_too_long', bundle)
    }
    if (!['copy_block', 'asset', 'design_link'].includes(draft.targetKind)
        || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(draft.targetKey)
        || !draft.targetLabel?.trim() || draft.targetLabel.trim().length > 120
        || !draft.proposedText?.trim()
        || seen.has(identity)) {
      return refuse('One of the edits is incomplete. Review it and try again.', 'draft_invalid', bundle)
    }
    if (draft.urlSnapshot && (!/^https:\/\/[^\s]+$/i.test(draft.urlSnapshot) || draft.urlSnapshot.length > 2048)) {
      return refuse('One of the visual references is no longer valid. Reload the page and try again.',
        'url_invalid', bundle)
    }
    seen.add(identity)
  }
  const note = input.note?.trim() ?? ''
  if (note.length > 2000) {
    return refuse('The overall note is too long (2,000 characters max).', 'note_too_long', bundle)
  }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) {
    return refuse('That piece is no longer available.', 'piece_unavailable', bundle)
  }
  if (item.version !== input.contentVersion) {
    return refuse('A newer version is ready. Reload the page before sending edits.', 'version_stale',
      { ...bundle, contentItemId: item.id })
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
    const failed = { ...bundle, contentItemId: item.id }
    if (error.message.includes('revision_already_in_progress')) {
      return refuse('The Dot has started this revision. Your saved edits were not sent. Please review the updated version when it returns.',
        'revision_in_progress', failed)
    }
    if (error.message.includes('stale') || error.message.includes('locked')) {
      return refuse('This version changed while you were reviewing it. Reload to see the current package.',
        'stale_or_locked', failed)
    }
    if (error.message.includes('rate_limited')) {
      return refuse('Too many requests were submitted. Please try again in an hour.', 'rate_limited', failed)
    }
    return refuse('Your edits could not be sent. We have your text and will be in touch, and it is still saved in this browser.',
      'write_failed', failed)
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
  // The single-block path predates the bundle and is still reachable. It carries her copy too, so
  // it logs on exactly the same terms. The one case that cannot log is a missing session or a
  // malformed form, where there is no client to attribute the attempt to.
  if (!context || !contentId || !blockKey || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(blockKey)
      || !validKey(idempotencyKey)) return { error: 'This form expired. Please reload and try again.' }
  const attempt = {
    clientId: context.session.clientId,
    contentId,
    requestedBy: context.session.userId,
    requesterName: context.session.name,
    drafts: [{ targetKind: 'copy_block', targetKey: blockKey, targetLabel: blockKey, proposedText }],
  }
  if (!context.session.canSubmitRequests) {
    return refuse('Your account cannot submit content requests.', 'cannot_submit_requests', attempt)
  }
  if (!proposedText) return refuse('Add the copy you would like us to use.', 'draft_invalid', attempt)
  if (proposedText.length > MAX_PROPOSED_TEXT) {
    return refuse(
      `The proposed copy is too long (${MAX_PROPOSED_TEXT.toLocaleString('en-CA')} characters max, `
        + `this is ${proposedText.length.toLocaleString('en-CA')}). We have your text and will be in touch.`,
      'draft_too_long', attempt)
  }
  const item = await getContentItem(context.session.clientId, contentId)
  if (!item) return refuse('That piece is no longer available.', 'piece_unavailable', attempt)
  const withItem = { ...attempt, contentItemId: item.id, contentVersion: item.version }
  const block = item.copy_blocks.find((candidate) => candidate.key === blockKey)
  if (!block) {
    return refuse('That copy block changed. Reload the page before suggesting an edit.', 'stale_or_locked', withItem)
  }
  // Not a refusal worth recording: she has changed nothing, so there is nothing of hers to lose.
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
    if (error.message.includes('already_open')) {
      return refuse('An edit for this copy block is already in progress.', 'revision_in_progress', withItem)
    }
    if (error.message.includes('stale') || error.message.includes('copy_block')) {
      return refuse('This copy changed. Reload the page and review the latest version.', 'stale_or_locked', withItem)
    }
    return refuse('Could not save the edit request. We have your text and will be in touch.', 'write_failed', withItem)
  }
  if (responseOutcome(data) === 'rate_limited') {
    return refuse('Too many requests were submitted. Please try again in an hour.', 'rate_limited', withItem)
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
