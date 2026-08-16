export function editDraftPrefix(scope: string, slug: string, contentId: string, version: number): string {
  return `portal-edit-draft:${encodeURIComponent(scope)}:${encodeURIComponent(slug)}:${encodeURIComponent(contentId)}:v${version}:`
}

export function editDraftKey(
  scope: string,
  slug: string,
  contentId: string,
  version: number,
  targetKind: string,
  targetKey: string,
): string {
  return `${editDraftPrefix(scope, slug, contentId, version)}${encodeURIComponent(targetKind)}:${encodeURIComponent(targetKey)}`
}

export function hasUnsentEditDrafts(storage: Storage, prefix: string): boolean {
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (key?.startsWith(prefix) && (storage.getItem(key) ?? '').trim()) return true
  }
  return false
}
