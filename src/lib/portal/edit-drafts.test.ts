import { describe, expect, it } from 'vitest'
import { editDraftKey, editDraftPiecePrefix, editDraftPrefix, hasUnsentEditDrafts, parseEditDraftKey } from './edit-drafts'

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

  it('keeps the existing key for a whole-block draft and appends a frame anchor only when present', () => {
    const block = editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'copy_block', 'caption')
    expect(block).toBe('portal-edit-draft:maria-user:kanset:piece-one:v2:copy_block:caption')
    const frame = editDraftKey('maria-user', 'kanset', 'piece-one', 2, 'asset', 'reel-cover', 'frame:3')
    expect(frame).toBe('portal-edit-draft:maria-user:kanset:piece-one:v2:asset:reel-cover:frame%3A3')
  })

  it('shares one piece prefix across versions', () => {
    const prefix = editDraftPiecePrefix('maria-user', 'kanset', 'piece-one')
    expect(editDraftPrefix('maria-user', 'kanset', 'piece-one', 2).startsWith(prefix)).toBe(true)
    expect(editDraftPrefix('maria-user', 'kanset', 'piece-one', 3).startsWith(prefix)).toBe(true)
  })

  it('parses a key back into its version, target and anchor', () => {
    const prefix = editDraftPiecePrefix('maria-user', 'kanset', 'piece-one')
    expect(parseEditDraftKey(prefix, editDraftKey('maria-user', 'kanset', 'piece-one', 4, 'asset', 'reel-cover', 'page:2')))
      .toEqual({ version: 4, targetKind: 'asset', targetKey: 'reel-cover', anchor: 'page:2' })
    expect(parseEditDraftKey(prefix, editDraftKey('maria-user', 'kanset', 'piece-one', 1, 'copy_block', 'caption')))
      .toEqual({ version: 1, targetKind: 'copy_block', targetKey: 'caption', anchor: '' })
    expect(parseEditDraftKey(prefix, 'portal-edit-draft:maria-user:kanset:piece-two:v1:copy_block:caption')).toBeNull()
    expect(parseEditDraftKey(prefix, `${prefix}garbage`)).toBeNull()
  })
})
