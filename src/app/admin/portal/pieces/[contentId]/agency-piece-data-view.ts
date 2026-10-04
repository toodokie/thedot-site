import {
  firstName, hoursSince, postsInLabel, requestAnchors, requestStateLabel,
} from '@/lib/portal/agency-ops-core'
import type { PieceRequestContext } from '@/lib/portal/agency-ops'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import type { AdminContentRequest } from '../../RequestAdmin'

// Pure view helpers for the admin piece page. No server imports, so the panel (and tests) can use
// them without pulling the Supabase admin client into a bundle.

export type RequestThumb = { label: string; url: string | null }
export type AgencyRequestView = {
  id: string
  heading: string
  kind: 'visual' | 'text'
  quote: string | null
  date: string
  state: string
  thumbs: RequestThumb[]
}
export type DraftSeatSummary = {
  seatName: string
  unsentCount: number
  failedCount: number
  carriedCount: number
  oldestSavedAt: string
  lastError: string | null
}
export type DraftLike = {
  status: string; auth_user_id: string; saved_at: string
  send_failed_at: string | null; last_send_error: string | null; carried_over_to_version: number | null
}

function excerpt(text: string, max = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function pickPreview(previews: SignedReviewPreview[], version: number | null, key: string | null): SignedReviewPreview | null {
  const candidates = previews.filter((preview) => preview.contentVersion === version)
  return candidates.find((preview) => preview.previewKey === key || preview.reviewAssetKey === key)
    ?? (candidates.length === 1 ? candidates[0] : null)
}

export function buildRequestViews(
  requests: AdminContentRequest[],
  context: PieceRequestContext,
  previews: SignedReviewPreview[],
): AgencyRequestView[] {
  return requests.filter((request) => request.requestType === 'edit' && request.edit).map((request) => {
    const edit = request.edit!
    const visual = edit.targetKind !== 'copy_block'
    const anchors = visual ? requestAnchors(request.id, edit.targetKey, context.bundles, context.sentDrafts) : []
    const preview = anchors.length ? pickPreview(previews, request.baseVersion, edit.targetKey) : null
    return {
      id: request.id,
      heading: anchors.length ? anchors.map((anchor) => anchor.label).join(', ')
        : edit.targetLabel ?? edit.blockLabel ?? (visual ? 'Visual' : 'Copy'),
      kind: visual ? 'visual' : 'text',
      quote: edit.proposedText ? excerpt(edit.proposedText) : null,
      date: request.createdAt.slice(0, 10),
      state: requestStateLabel(request.status),
      thumbs: anchors.map((anchor) => ({ label: anchor.label, url: preview?.frames[anchor.index - 1]?.url ?? null })),
    }
  })
}

export function summarizeDrafts(drafts: DraftLike[], seatNames: Map<string, string>): DraftSeatSummary[] {
  const bySeat = new Map<string, DraftSeatSummary>()
  for (const draft of drafts) {
    if (draft.status !== 'unsent') continue
    const current = bySeat.get(draft.auth_user_id) ?? {
      seatName: seatNames.get(draft.auth_user_id) ?? 'Client', unsentCount: 0, failedCount: 0,
      carriedCount: 0, oldestSavedAt: draft.saved_at, lastError: null,
    }
    current.unsentCount += 1
    if (draft.send_failed_at) { current.failedCount += 1; current.lastError = draft.last_send_error ?? current.lastError }
    if (draft.carried_over_to_version != null) current.carriedCount += 1
    if (draft.saved_at < current.oldestSavedAt) current.oldestSavedAt = draft.saved_at
    bySeat.set(draft.auth_user_id, current)
  }
  return [...bySeat.values()].sort((a, b) => b.unsentCount - a.unsentCount)
}

export function unsentAlertSentence(summary: DraftSeatSummary, plannedDate: string | null, todayIso: string, now: Date): string {
  const hours = hoursSince(summary.oldestSavedAt, now)
  const when = postsInLabel(plannedDate, todayIso)
  const tail = when === 'no planned date' ? 'It has no planned date.' : `It ${when}.`
  return `${firstName(summary.seatName)} has ${summary.unsentCount} unsent edit${summary.unsentCount === 1 ? '' : 's'} on this piece, `
    + `saved ${hours} hour${hours === 1 ? '' : 's'} ago. ${tail}`
}

export type TickCount = { done: number; total: number }

// Her server ticks (0094, per seat and version) against the tabs her page shows today. A tick on a
// tab that no longer exists does not count, the same rule her own decision bar applies.
export function reviewTickCount(tabKeys: string[], ticked: string[]): TickCount {
  const seen = new Set(ticked)
  return { done: tabKeys.filter((key) => seen.has(key)).length, total: tabKeys.length }
}

export function stateBarLine(mariaView: string, ticks: TickCount | null): string {
  return ticks && ticks.total > 0 ? `${ticks.done} of ${ticks.total} reviewed · ${mariaView}` : mariaView
}
