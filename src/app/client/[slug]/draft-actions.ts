'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { createSupabaseServer } from '@/lib/supabase/server'
import { recordRefusal, type RefusalReason, type RefusedDraft } from '@/lib/portal/refusal-log'
import type { DraftDiscardReason, DraftTargetKind, ServerDraftRow } from '@/lib/portal/review-drafts-core'

// Durable review drafts (spec 2026-10-03 section 6, migration 0093). Autosave and discard never
// redirect: a redirect in the middle of typing would take Maria off the page. They answer with an
// error and the browser keeps her text. Send behaves like every other client action.

// Must stay in step with request-actions.ts and migration 0088.
const MAX_PROPOSED_TEXT = 50000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEPT = 'It is still saved on this device.'

export type DraftWriteResult =
  | { outcome: 'saved' | 'stale' | 'discarded' | 'not_found'; draft?: ServerDraftRow }
  | { error: string; retryable: boolean }

export type SendDraftsResult = { error?: string; success?: string; requestIds?: string[]; sentDraftIds?: string[] }

type Supabase = Awaited<ReturnType<typeof createSupabaseServer>>

type RefusalContext = {
  clientId: string
  contentItemId?: string | null
  contentId?: string | null
  contentVersion?: number | null
  requestedBy?: string | null
  requesterName?: string | null
  drafts?: RefusedDraft[]
  draftIds?: string[]
}

async function refuse(message: string, reason: RefusalReason, context: RefusalContext): Promise<SendDraftsResult> {
  await recordRefusal({ ...context, reason, clientMessage: message })
  return { error: message }
}

function writeResult(data: unknown): DraftWriteResult {
  const value = data && typeof data === 'object' ? data as { outcome?: unknown; draft?: unknown } : {}
  const outcome = value.outcome
  if (outcome === 'saved' || outcome === 'stale' || outcome === 'discarded' || outcome === 'not_found') {
    const draft = value.draft && typeof value.draft === 'object' ? value.draft as ServerDraftRow : undefined
    return draft ? { outcome, draft } : { outcome }
  }
  return { error: `Could not save your edit to the portal. ${KEPT}`, retryable: true }
}

// Her words for the failure log, read from her own saved drafts through her own session.
async function draftTexts(supabase: Supabase, ids: string[]): Promise<RefusedDraft[]> {
  if (!ids.length) return []
  try {
    const { data } = await supabase.from('content_review_drafts')
      .select('target_kind, target_key, target_label, anchor_label, body').in('id', ids)
    return ((data ?? []) as Array<{ target_kind: string; target_key: string; target_label: string;
      anchor_label: string | null; body: string }>).map((row) => ({
      targetKind: row.target_kind,
      targetKey: row.target_key,
      targetLabel: row.anchor_label ? `${row.target_label} · ${row.anchor_label}` : row.target_label,
      proposedText: row.body,
    }))
  } catch {
    return []
  }
}

export async function saveReviewDraft(input: {
  slug: string
  contentId: string
  baseVersion: number
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  anchorLabel: string | null
  targetLabel: string
  urlSnapshot: string | null
  quotedText: string | null
  body: string
  savedAt: string
}): Promise<DraftWriteResult> {
  const session = await getClientSession(input.slug)
  if (!session) return { error: `Your session ended. ${KEPT}`, retryable: false }
  if (!session.canSubmitRequests) return { error: 'Your account cannot edit this piece.', retryable: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return { error: `That piece is no longer available. ${KEPT}`, retryable: false }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('save_review_draft', {
    p_content_id: item.id,
    p_base_version: input.baseVersion,
    p_target_kind: input.targetKind,
    p_target_key: input.targetKey,
    p_anchor: input.anchor ?? '',
    p_anchor_label: input.anchorLabel ?? null,
    p_target_label: input.targetLabel,
    p_url_snapshot: input.urlSnapshot ?? null,
    p_quoted_text: input.quotedText ?? null,
    p_body: input.body,
    p_saved_at: input.savedAt,
  })
  if (error) {
    if (error.message.includes('review_draft_stale_version') || error.message.includes('review_draft_locked')) {
      return { error: `This piece changed. ${KEPT} Reload to see the current version.`, retryable: false }
    }
    if (error.message.includes('invalid review draft') || error.message.includes('review_draft_target_not_found')
        || error.message.includes('too_many_review_drafts')) {
      return { error: `This edit could not be saved to the portal. ${KEPT}`, retryable: false }
    }
    return { error: `Could not save your edit to the portal. ${KEPT}`, retryable: true }
  }
  return writeResult(data)
}

export async function discardReviewDraft(input: {
  slug: string
  contentId: string
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  reason: DraftDiscardReason
  savedAt: string
}): Promise<DraftWriteResult> {
  if (!['client_discarded', 'reverted', 'emptied'].includes(input.reason)) {
    return { error: 'That edit could not be discarded.', retryable: false }
  }
  const session = await getClientSession(input.slug)
  if (!session) return { error: 'Your session ended.', retryable: false }
  if (!session.canSubmitRequests) return { error: 'Your account cannot edit this piece.', retryable: false }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return { error: 'That piece is no longer available.', retryable: false }
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('discard_review_draft', {
    p_content_id: item.id,
    p_target_kind: input.targetKind,
    p_target_key: input.targetKey,
    p_anchor: input.anchor ?? '',
    p_reason: input.reason,
    p_saved_at: input.savedAt,
  })
  if (error) return { error: 'Could not discard the edit on the portal.', retryable: !error.message.includes('invalid') }
  return writeResult(data)
}

export async function sendReviewDrafts(input: {
  slug: string
  contentId: string
  contentVersion: number
  draftIds: string[]
  note?: string
  idempotencyKey: string
}): Promise<SendDraftsResult> {
  const session = await getClientSession(input.slug)
  if (!session) redirect('/client/login')
  const supabase = await createSupabaseServer()
  const given = Array.isArray(input.draftIds) ? input.draftIds : []
  const draftIds = given.filter((id) => typeof id === 'string' && UUID.test(id))
  const context: RefusalContext = {
    clientId: session.clientId,
    contentId: input.contentId,
    contentVersion: Number.isInteger(input.contentVersion) ? input.contentVersion : null,
    requestedBy: session.userId,
    requesterName: session.name,
    draftIds,
  }
  const withText = async (extra: Partial<RefusalContext> = {}): Promise<RefusalContext> =>
    ({ ...context, ...extra, drafts: await draftTexts(supabase, draftIds) })

  if (!session.canSubmitRequests) {
    return refuse('Your account cannot send edits.', 'cannot_submit_requests', await withText())
  }
  if (!UUID.test(input.idempotencyKey ?? '') || !Number.isInteger(input.contentVersion) || input.contentVersion < 1) {
    return refuse('This review expired. Reload the page and try again.', 'expired_review', await withText())
  }
  if (draftIds.length < 1 || draftIds.length > 50 || draftIds.length !== given.length
      || new Set(draftIds).size !== draftIds.length) {
    return refuse('Add at least one edit before sending.', 'empty_bundle', await withText())
  }
  const note = input.note?.trim() ?? ''
  if (note.length > 2000) {
    return refuse('The overall note is too long (2,000 characters max).', 'note_too_long', await withText())
  }
  const item = await getContentItem(session.clientId, input.contentId)
  if (!item) return refuse('That piece is no longer available.', 'piece_unavailable', await withText())
  if (item.version !== input.contentVersion) {
    return refuse('A newer version is ready. Reload the page before sending edits.', 'version_stale',
      await withText({ contentItemId: item.id }))
  }
  const { data, error } = await supabase.rpc('send_review_drafts', {
    p_content_id: item.id,
    p_content_version: input.contentVersion,
    p_draft_ids: draftIds,
    p_note: note || null,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) {
    const failed = { contentItemId: item.id }
    if (error.message.includes('drafts_carried_over')) {
      return refuse('Some of your edits were written against the previous version. Keep or discard them, then send.',
        'version_stale', await withText(failed))
    }
    // Migration 0093: the key already sent a different set of drafts (her drafts changed while a
    // send was in flight). Nothing was sent or marked; her drafts stay unsent for a fresh send.
    if (error.message.includes('idempotency key reused')) {
      return refuse('Your edits changed while they were being sent. Nothing was sent. Send them again.',
        'drafts_changed', await withText(failed))
    }
    if (error.message.includes('drafts_changed')) {
      return refuse('Your edits changed on another device. Reload to see all of them, then send.',
        'drafts_changed', await withText(failed))
    }
    if (error.message.includes('review_draft_too_long')) {
      return refuse(`One of the edits is too long (${MAX_PROPOSED_TEXT.toLocaleString('en-CA')} characters max). `
        + 'We have your text and will be in touch.', 'draft_too_long', await withText(failed))
    }
    if (error.message.includes('revision_already_in_progress')) {
      return refuse('The Dot has started this revision. Your saved edits were not sent. Please review the updated version when it returns.',
        'revision_in_progress', await withText(failed))
    }
    if (error.message.includes('stale') || error.message.includes('locked')) {
      return refuse('This version changed while you were reviewing it. Reload to see the current package.',
        'stale_or_locked', await withText(failed))
    }
    if (error.message.includes('rate_limited')) {
      return refuse('Too many requests were submitted. Please try again in an hour.', 'rate_limited',
        await withText(failed))
    }
    return refuse('Your edits could not be sent. They are still saved, and we have your text.', 'write_failed',
      await withText(failed))
  }
  const result = data && typeof data === 'object' ? data as Record<string, unknown> : {}
  revalidatePath(`/client/${input.slug}`)
  revalidatePath(`/client/${input.slug}/requests`)
  revalidatePath(`/client/${input.slug}/piece/${input.contentId}`)
  const strings = (value: unknown) => Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string') : []
  return {
    success: draftIds.length === 1 ? 'Your edit was sent to The Dot.' : `Your ${draftIds.length} edits were sent to The Dot.`,
    requestIds: strings(result.request_ids),
    sentDraftIds: Array.isArray(result.sent_draft_ids) ? strings(result.sent_draft_ids) : draftIds,
  }
}

// A send that never reached the server (offline, or the request died on the way). The browser
// calls this when the connection returns, so the failure is still written down with her text.
export async function reportReviewSendFailure(input: {
  slug: string
  contentId: string
  contentVersion: number
  draftIds: string[]
  drafts: RefusedDraft[]
}): Promise<void> {
  const session = await getClientSession(input.slug)
  if (!session || !session.canSubmitRequests) return
  const str = (value: unknown) => (typeof value === 'string' ? value : null)
  const drafts = (Array.isArray(input.drafts) ? input.drafts : []).slice(0, 50).map((draft) => ({
    targetKind: str(draft?.targetKind),
    targetKey: str(draft?.targetKey),
    targetLabel: str(draft?.targetLabel)?.slice(0, 120) ?? null,
    proposedText: str(draft?.proposedText),
  }))
  const draftIds = (Array.isArray(input.draftIds) ? input.draftIds : [])
    .filter((id) => typeof id === 'string' && UUID.test(id)).slice(0, 50)
  const item = await getContentItem(session.clientId, input.contentId).catch(() => null)
  await recordRefusal({
    clientId: session.clientId,
    contentItemId: item?.id ?? null,
    contentId: input.contentId,
    contentVersion: Number.isInteger(input.contentVersion) ? input.contentVersion : null,
    requestedBy: session.userId,
    requesterName: session.name,
    reason: 'network_unreachable',
    clientMessage: "Couldn't send. Retry",
    drafts,
    draftIds,
  })
}
