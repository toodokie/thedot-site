import { describe, expect, it } from 'vitest'
import { editDraftKey, editDraftPrefix, hasUnsentEditDrafts } from './edit-drafts'

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

describe('portal edit drafts', () => {
  it('scopes drafts to the signed-in seat and piece', () => {
    const first = editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption')
    const second = editDraftKey('preview-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption')
    expect(first).not.toBe(second)
    expect(first.startsWith(editDraftPrefix('maria-user', 'kanset', 'piece-one', 2))).toBe(true)
  })

  it('detects only non-empty drafts inside the requested piece prefix', () => {
    const storage = memoryStorage()
    storage.setItem(editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption'), 'Rewritten copy')
    storage.setItem(editDraftKey('maria-user', 'kanset', 'piece-two', 2, 'copy_block', 'caption'), 'Another piece')
    expect(hasUnsentEditDrafts(
      storage,
      editDraftPrefix('maria-user', 'kanset', 'piece-one', 2),
    )).toBe(true)
    storage.setItem(editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption'), '   ')
    expect(hasUnsentEditDrafts(
      storage,
      editDraftPrefix('maria-user', 'kanset', 'piece-one', 2),
    )).toBe(false)
  })
})
