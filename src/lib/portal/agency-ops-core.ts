import { AGENCY_LABELS } from './progress-bar-model'
import { GATE_ORDER, type GateKey, type ResolvedGate } from './gates'

// Pure helpers for Agency Ops (piece page plan 5). Browser-safe: no server imports.

export const CLIENT_SIGNAL_TYPES = [
  'review_send_failed', 'review_drafts_carried_over', 'portal_feedback_submitted',
] as const
export type ClientSignalType = (typeof CLIENT_SIGNAL_TYPES)[number]

// One row of agency_open_client_signals (migration 0095).
export type OpenClientSignalRow = {
  event_id: string
  seq: number
  client_id: string
  event_type: string
  created_at: string
  actor_name: string
  content_item_id: string | null
  content_key: string | null
  title: string | null
  payload: Record<string, unknown>
}

export type ClientSignal = {
  id: string
  kind: ClientSignalType
  pieceKey: string | null
  pieceTitle: string | null
  headline: string
  detail: string | null
  createdAt: string
  resolvable: boolean
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : null
}
function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'The client'
}

export function clientSignalFromRow(row: OpenClientSignalRow): ClientSignal | null {
  if (!(CLIENT_SIGNAL_TYPES as readonly string[]).includes(row.event_type)) return null
  const kind = row.event_type as ClientSignalType
  const piece = row.title ?? row.content_key ?? 'a piece'
  const base = {
    id: row.event_id, kind, pieceKey: row.content_key, pieceTitle: row.title,
    createdAt: row.created_at, resolvable: true,
  }
  if (kind === 'portal_feedback_submitted') {
    const rating = num(row.payload.rating) ?? 0
    const comment = str(row.payload.comment)
    return { ...base, headline: `Feedback: ${rating} of 5`,
      detail: comment ? `${firstName(row.actor_name)}: “${comment}”` : `${firstName(row.actor_name)} left no comment.` }
  }
  if (kind === 'review_send_failed') {
    const count = num(row.payload.edit_count) ?? 0
    const reason = (str(row.payload.reason_code) ?? 'unknown').replaceAll('_', ' ')
    return { ...base, headline: `Edits not sent: ${piece}`,
      detail: `${count === 0 ? 'An edit' : plural(count, 'edit')} refused (${reason}). Her text is saved.` }
  }
  const count = num(row.payload.draft_count) ?? 0
  return { ...base, headline: `Edits carried to v${num(row.payload.to_version) ?? '?'}: ${piece}`,
    detail: `${plural(count, 'unsent edit')} written against v${num(row.payload.from_version) ?? '?'}` }
}

function dayDiff(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso.slice(0, 10)}T12:00:00Z`)
  const b = Date.parse(`${toIso.slice(0, 10)}T12:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}
function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', month: 'short', day: 'numeric' })
    .format(new Date(`${iso.slice(0, 10)}T12:00:00Z`))
}

export function postsInLabel(plannedDate: string | null, todayIso: string): string {
  if (!plannedDate) return 'no planned date'
  const days = dayDiff(todayIso, plannedDate)
  if (days === 0) return 'posts today'
  if (days > 0) return `posts in ${plural(days, 'day')}`
  return `was due ${shortDay(plannedDate)}`
}

export function hoursSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 3_600_000))
}

export function unsentAlertDetail(
  alert: { oldest_saved_at: string; planned_date: string | null },
  todayIso: string,
  now: Date,
): string {
  return `Saved ${plural(hoursSince(alert.oldest_saved_at, now), 'hour')} ago · ${postsInLabel(alert.planned_date, todayIso)}`
}

export function feedbackLine(rating: number, comment: string | null): string {
  return `Review page: ${rating} of 5. ${comment ? `“${comment}”` : 'No comment.'}`
}

export function mariaViewLine(input: {
  released: boolean
  decision: 'approved' | 'change_requested' | null
  unsentCount: number
  openEditCount: number
  published: boolean
}): string {
  if (!input.released) return 'Not shared with Maria yet'
  if (input.published) return 'Live'
  if (input.decision === 'approved') return 'Approved'
  if (input.unsentCount > 0) return `${plural(input.unsentCount, 'unsent edit')} · Approve waiting`
  if (input.openEditCount > 0) return `${plural(input.openEditCount, 'sent edit')} waiting for you`
  return 'Waiting for her review'
}

export type GateDotState = 'done' | 'open' | 'na' | 'absent'
export type GateDot = { key: GateKey; label: string; state: GateDotState; date: string | null }

// One dot per step, the same collapse rule as the Pieces table: absent if any row is untracked,
// done only when every destination is done, n/a when nothing is open, otherwise open.
export function gateDots(gates: ResolvedGate[]): GateDot[] {
  return GATE_ORDER.map((key) => {
    const rows = gates.filter((gate) => gate.key === key)
    const state: GateDotState = rows.length === 0 || rows.some((gate) => !gate.present) ? 'absent'
      : rows.every((gate) => gate.state === 'done') ? 'done'
      : rows.every((gate) => gate.state !== 'open') ? 'na'
      : 'open'
    const dates = rows.map((gate) => gate.date).filter((date): date is string => Boolean(date)).sort()
    return { key, label: AGENCY_LABELS[key], state, date: state === 'done' ? dates.at(-1)?.slice(0, 10) ?? null : null }
  })
}

export function gateSummary(dots: GateDot[]): string {
  return `${dots.filter((dot) => dot.state === 'done').length} of ${dots.length} gates`
}

export type VersionRow = { version: number; label: string; date: string | null }

export function versionRows(
  versions: Array<{ version: number; synced_at: string | null }>,
  workingVersion: number | null | undefined,
  visibleVersion: number | null | undefined,
): VersionRow[] {
  return [...versions].sort((a, b) => b.version - a.version).map((row) => ({
    version: row.version,
    date: row.synced_at ? row.synced_at.slice(0, 10) : null,
    label: row.version === visibleVersion ? `v${row.version} shared with Maria`
      : row.version === workingVersion && (visibleVersion == null || row.version > visibleVersion)
        ? `v${row.version} working, not shared yet`
        : `v${row.version} superseded`,
  }))
}

const REQUEST_STATE: Record<string, string> = {
  pending: 'Open', applying: 'Being applied', prepared: 'Being applied', applied: 'Applied',
  rejected: 'Declined', superseded: 'Superseded', conflicted: 'Needs attention',
}
export function requestStateLabel(status: string): string {
  return REQUEST_STATE[status] ?? status
}

export type FrameAnchor = { kind: 'frame' | 'page'; index: number; label: string }

export function parseAnchor(anchor: string, label: string | null): FrameAnchor | null {
  const match = /^(frame|page):([1-9][0-9]{0,2})$/.exec(anchor)
  if (!match) return null
  const kind = match[1] as 'frame' | 'page'
  const index = Number(match[2])
  return { kind, index, label: label?.trim() || `${kind === 'frame' ? 'Frame' : 'Page'} ${index}` }
}

export type SentDraftAnchorRow = {
  sent_bundle_id: string | null
  target_kind: string
  target_key: string
  anchor: string
  anchor_label: string | null
}

// Plan 3 composes frame notes into one asset edit, so the request row no longer carries the frame.
// The sent drafts keep it: a request's frames are the sent drafts in the same bundle on the same
// asset. Sorted by index, duplicates dropped.
export function requestAnchors(
  requestId: string,
  targetKey: string | null,
  bundles: Array<{ id: string; request_ids: string[] }>,
  sentDrafts: SentDraftAnchorRow[],
): FrameAnchor[] {
  if (!targetKey) return []
  const bundleIds = new Set(bundles.filter((bundle) => bundle.request_ids.includes(requestId)).map((bundle) => bundle.id))
  const seen = new Map<string, FrameAnchor>()
  for (const draft of sentDrafts) {
    if (!draft.sent_bundle_id || !bundleIds.has(draft.sent_bundle_id)) continue
    if (draft.target_kind !== 'asset' || draft.target_key !== targetKey) continue
    const anchor = parseAnchor(draft.anchor, draft.anchor_label)
    if (anchor) seen.set(`${anchor.kind}:${anchor.index}`, anchor)
  }
  return [...seen.values()].sort((a, b) => a.index - b.index)
}
