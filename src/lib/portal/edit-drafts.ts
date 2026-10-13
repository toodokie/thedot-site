// Browser keys for unsent review drafts. Since migration 0093 the browser copy is an offline
// buffer for the server draft, not the only copy. Whole-block keys are unchanged from before so
// drafts already sitting in a browser are still found; a frame or page anchor is appended only
// when present.

export function editDraftPiecePrefix(scope: string, slug: string, contentId: string): string {
  return `portal-edit-draft:${encodeURIComponent(scope)}:${encodeURIComponent(slug)}:${encodeURIComponent(contentId)}:`
}

export function editDraftPrefix(scope: string, slug: string, contentId: string, version: number): string {
  return `${editDraftPiecePrefix(scope, slug, contentId)}v${version}:`
}

export function editDraftKey(
  scope: string,
  slug: string,
  contentId: string,
  version: number,
  targetKind: string,
  targetKey: string,
  anchor = '',
): string {
  const base = `${editDraftPrefix(scope, slug, contentId, version)}${encodeURIComponent(targetKind)}:${encodeURIComponent(targetKey)}`
  return anchor ? `${base}:${encodeURIComponent(anchor)}` : base
}

export type ParsedEditDraftKey = { version: number; targetKind: string; targetKey: string; anchor: string }

export function parseEditDraftKey(piecePrefix: string, key: string): ParsedEditDraftKey | null {
  if (!key.startsWith(piecePrefix)) return null
  const match = /^v(\d+):([^:]+):([^:]+)(?::([^:]+))?$/.exec(key.slice(piecePrefix.length))
  if (!match) return null
  try {
    return {
      version: Number(match[1]),
      targetKind: decodeURIComponent(match[2]),
      targetKey: decodeURIComponent(match[3]),
      anchor: match[4] ? decodeURIComponent(match[4]) : '',
    }
  } catch {
    return null
  }
}

export function hasUnsentEditDrafts(storage: Storage, prefix: string): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(prefix) && (storage.getItem(key) ?? '').trim()) return true
  }
  return false
}
