// Durable review drafts (spec 2026-10-03 section 6, migration 0093). Pure and browser-safe:
// shared by ReviewDraftProvider, the draft server actions and the agency readers.

export type DraftTargetKind = 'copy_block' | 'asset' | 'design_link'
export type DraftDiscardReason = 'client_discarded' | 'reverted' | 'emptied'
export type DraftSyncState = 'idle' | 'saving' | 'saved' | 'offline' | 'send_failed'

// "Written a few seconds after typing stops" (spec 6.1).
export const DRAFT_AUTOSAVE_DELAY_MS = 2000
export const DRAFT_ANCHOR_PATTERN = /^(frame|page):[1-9][0-9]{0,2}$/

export const DRAFT_STATUS_TEXT: Record<Exclude<DraftSyncState, 'idle'>, string> = {
  saving: 'Saving…',
  saved: 'Saved · not sent yet',
  offline: 'Saved on this phone · will sync when online',
  send_failed: "Couldn't send. Retry",
}

// Exactly the columns migration 0093 grants to a client seat.
export const SERVER_DRAFT_COLUMNS = 'id, content_item_id, base_version, target_kind, target_key, anchor, '
  + 'anchor_label, target_label, url_snapshot, quoted_text, body, status, saved_at, updated_at, '
  + 'carried_over_at, carried_over_to_version, send_failed_at, last_send_error'

export type ServerDraftRow = {
  id: string
  content_item_id: string
  base_version: number
  target_kind: DraftTargetKind
  target_key: string
  anchor: string
  anchor_label: string | null
  target_label: string
  url_snapshot: string | null
  quoted_text: string | null
  body: string
  status: 'unsent' | 'sent' | 'discarded'
  saved_at: string
  updated_at: string
  carried_over_at: string | null
  carried_over_to_version: number | null
  send_failed_at: string | null
  last_send_error: string | null
}

export type LocalDraftEntry = {
  version: number
  targetKind: DraftTargetKind
  targetKey: string
  anchor: string
  proposedText: string
  quotedText: string | null
  savedAt: string | null
  label: string | null
  urlSnapshot: string | null
  anchorLabel: string | null
  serverId: string | null
  syncedAt: string | null
}

export type DurableDraft = {
  kind: DraftTargetKind
  key: string
  anchor: string
  anchorLabel: string | null
  label: string
  urlSnapshot: string | null
  proposedText: string
  quotedText: string | null
  baseVersion: number
  savedAt: string
  // The version a carried draft was written against; null when it belongs to the current version.
  carriedFromVersion: number | null
  serverId: string | null
  // The savedAt the server last confirmed. Equal to savedAt when the server holds this exact text.
  syncedAt: string | null
  sendFailedAt: string | null
}

export type DraftIdentityParts = { kind: string; key: string; anchor?: string | null }

export function draftIdentity(parts: DraftIdentityParts): string {
  return `${parts.kind}:${parts.key}:${parts.anchor ?? ''}`
}

export function humanizeDraftKey(key: string): string {
  const words = key.replace(/[-_]+/g, ' ').trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Edit'
}

function time(value: string | null | undefined): number {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(parsed) ? 0 : parsed
}

export function serverRowToDraft(row: ServerDraftRow, currentVersion: number): DurableDraft {
  return {
    kind: row.target_kind,
    key: row.target_key,
    anchor: row.anchor ?? '',
    anchorLabel: row.anchor_label,
    label: row.target_label,
    urlSnapshot: row.url_snapshot,
    proposedText: row.body,
    quotedText: row.quoted_text,
    baseVersion: row.base_version,
    savedAt: row.saved_at,
    carriedFromVersion: row.base_version < currentVersion ? row.base_version : null,
    serverId: row.id,
    syncedAt: row.saved_at,
    sendFailedAt: row.send_failed_at,
  }
}

export function localEntryToDraft(entry: LocalDraftEntry, currentVersion: number): DurableDraft {
  return {
    kind: entry.targetKind,
    key: entry.targetKey,
    anchor: entry.anchor,
    anchorLabel: entry.anchorLabel,
    label: entry.label ?? humanizeDraftKey(entry.targetKey),
    urlSnapshot: entry.urlSnapshot,
    proposedText: entry.proposedText,
    quotedText: entry.quotedText,
    baseVersion: entry.version,
    savedAt: entry.savedAt ?? new Date(0).toISOString(),
    carriedFromVersion: entry.version < currentVersion ? entry.version : null,
    serverId: entry.serverId,
    syncedAt: entry.syncedAt,
    sendFailedAt: null,
  }
}

export type ReconcileResult = {
  drafts: Record<string, DurableDraft>
  // Identities whose browser copy is newer than the server and must be saved.
  push: string[]
  // Browser copies the server has already sent or discarded at a later time. Removing these loses
  // nothing: the same or a newer decision already exists on the server.
  dropLocal: DraftIdentityParts[]
}

// Spec 6.1: latest saved_at wins per target, and nothing is silently deleted.
export function reconcileDrafts(
  local: LocalDraftEntry[],
  server: ServerDraftRow[],
  currentVersion: number,
): ReconcileResult {
  const unsent = new Map<string, ServerDraftRow>()
  const closedAt = new Map<string, number>()
  for (const row of server) {
    const id = draftIdentity({ kind: row.target_kind, key: row.target_key, anchor: row.anchor })
    if (row.status === 'unsent') unsent.set(id, row)
    else closedAt.set(id, Math.max(closedAt.get(id) ?? 0, time(row.saved_at)))
  }
  const newestLocal = new Map<string, LocalDraftEntry>()
  for (const entry of local) {
    const id = draftIdentity({ kind: entry.targetKind, key: entry.targetKey, anchor: entry.anchor })
    const seen = newestLocal.get(id)
    if (!seen || time(entry.savedAt) > time(seen.savedAt)
        || (time(entry.savedAt) === time(seen.savedAt) && entry.version > seen.version)) {
      newestLocal.set(id, entry)
    }
  }
  const drafts: Record<string, DurableDraft> = {}
  const push: string[] = []
  const dropLocal: DraftIdentityParts[] = []
  for (const id of new Set([...unsent.keys(), ...newestLocal.keys()])) {
    const row = unsent.get(id)
    const entry = newestLocal.get(id)
    if (entry && (!row || time(entry.savedAt) > time(row.saved_at))) {
      if (!row && closedAt.has(id) && time(entry.savedAt) <= (closedAt.get(id) ?? 0)) {
        dropLocal.push({ kind: entry.targetKind, key: entry.targetKey, anchor: entry.anchor })
        continue
      }
      drafts[id] = { ...localEntryToDraft(entry, currentVersion), serverId: row?.id ?? null, syncedAt: null }
      push.push(id)
      continue
    }
    if (row) drafts[id] = serverRowToDraft(row, currentVersion)
  }
  return { drafts, push, dropLocal }
}

export function deriveSyncState(input: {
  draftCount: number
  pending: number
  inFlight: boolean
  online: boolean
  sendFailed: boolean
}): DraftSyncState {
  if (input.sendFailed && input.draftCount > 0) return 'send_failed'
  if (input.draftCount === 0 && input.pending === 0 && !input.inFlight) return 'idle'
  if (!input.online && (input.pending > 0 || input.inFlight)) return 'offline'
  if (input.pending > 0 || input.inFlight) return 'saving'
  return input.draftCount > 0 ? 'saved' : 'idle'
}

// One row of agency_unsent_review_draft_alerts (migration 0093). Plan 5 renders these.
export type UnsentDraftAlert = {
  client_id: string
  content_item_id: string
  content_id: string
  title: string
  planned_date: string
  auth_user_id: string
  seat_name: string
  unsent_count: number
  stale_count: number
  carried_count: number
  oldest_saved_at: string
}

export function unsentDraftAlertLine(alert: Pick<UnsentDraftAlert, 'seat_name' | 'unsent_count' | 'title'>): string {
  const first = alert.seat_name.trim().split(/\s+/)[0] || 'The client'
  return `${first} has ${alert.unsent_count} unsent ${alert.unsent_count === 1 ? 'edit' : 'edits'} on ${alert.title}`
}
