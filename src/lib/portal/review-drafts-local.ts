// The browser copy of review drafts: an offline buffer since migration 0093. Every function here
// may throw when storage is blocked; ReviewDraftProvider catches and carries on with the server.
import { editDraftKey, editDraftPiecePrefix, parseEditDraftKey } from './edit-drafts'
import type { DraftIdentityParts, DraftTargetKind, DurableDraft, LocalDraftEntry } from './review-drafts-core'

const KINDS = new Set<string>(['copy_block', 'asset', 'design_link'])

export type LocalScope = { scope: string; slug: string; contentId: string }

function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function readLocalDrafts(storage: Storage, piecePrefix: string): LocalDraftEntry[] {
  const entries: LocalDraftEntry[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    const parsed = parseEditDraftKey(piecePrefix, key)
    if (!parsed || !KINDS.has(parsed.targetKind)) continue
    let value: Record<string, unknown>
    try {
      const raw: unknown = JSON.parse(storage.getItem(key) ?? '')
      if (!raw || typeof raw !== 'object') continue
      value = raw as Record<string, unknown>
    } catch {
      continue
    }
    const proposedText = text(value.proposedText)
    if (!proposedText || !proposedText.trim()) continue
    entries.push({
      version: parsed.version,
      targetKind: parsed.targetKind as DraftTargetKind,
      targetKey: parsed.targetKey,
      anchor: parsed.anchor,
      proposedText,
      quotedText: text(value.quotedText),
      savedAt: text(value.savedAt),
      label: text(value.label),
      urlSnapshot: text(value.urlSnapshot),
      anchorLabel: text(value.anchorLabel),
      serverId: text(value.serverId),
      syncedAt: text(value.syncedAt),
    })
  }
  return entries
}

export function removeLocalDraft(storage: Storage, piecePrefix: string, target: DraftIdentityParts): void {
  const doomed: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) continue
    const parsed = parseEditDraftKey(piecePrefix, key)
    if (parsed && parsed.targetKind === target.kind && parsed.targetKey === target.key
        && parsed.anchor === (target.anchor ?? '')) doomed.push(key)
  }
  for (const key of doomed) storage.removeItem(key)
}

export function writeLocalDraft(storage: Storage, where: LocalScope, draft: DurableDraft): void {
  removeLocalDraft(storage, editDraftPiecePrefix(where.scope, where.slug, where.contentId), draft)
  storage.setItem(
    editDraftKey(where.scope, where.slug, where.contentId, draft.baseVersion, draft.kind, draft.key, draft.anchor),
    JSON.stringify({
      proposedText: draft.proposedText,
      quotedText: draft.quotedText,
      savedAt: draft.savedAt,
      label: draft.label,
      urlSnapshot: draft.urlSnapshot,
      anchorLabel: draft.anchorLabel,
      serverId: draft.serverId,
      syncedAt: draft.syncedAt,
    }),
  )
}
