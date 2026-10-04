import { describe, expect, it } from 'vitest'
import { editDraftKey, editDraftPiecePrefix } from './edit-drafts'
import { readLocalDrafts, removeLocalDraft, writeLocalDraft } from './review-drafts-local'
import type { DurableDraft } from './review-drafts-core'

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

const SCOPE = { scope: 'maria', slug: 'kanset', contentId: 'piece' }
const PREFIX = editDraftPiecePrefix('maria', 'kanset', 'piece')

function draft(overrides: Partial<DurableDraft> = {}): DurableDraft {
  return {
    kind: 'copy_block', key: 'caption', anchor: '', anchorLabel: null, label: 'Caption', urlSnapshot: null,
    proposedText: 'Typed', quotedText: null, baseVersion: 2, savedAt: '2026-10-03T10:00:00.000Z',
    carriedFromVersion: null, serverId: null, syncedAt: null, sendFailedAt: null, ...overrides,
  }
}

describe('browser draft buffer', () => {
  it('reads drafts of every version of this piece, including legacy entries', () => {
    const storage = memoryStorage()
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Legacy' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'asset', 'reel', 'frame:3'),
      JSON.stringify({ proposedText: 'Frame note', savedAt: '2026-10-03T10:00:00.000Z', anchorLabel: 'Frame 3', serverId: 'abc' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'other', 2, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Other piece' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'blank'), JSON.stringify({ proposedText: '   ' }))
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'raw'), 'not json')
    const entries = readLocalDrafts(storage, PREFIX)
    expect(entries).toHaveLength(2)
    expect(entries).toContainEqual(expect.objectContaining({ version: 1, targetKey: 'caption', proposedText: 'Legacy', savedAt: null }))
    expect(entries).toContainEqual(expect.objectContaining({ version: 2, targetKind: 'asset', anchor: 'frame:3', anchorLabel: 'Frame 3', serverId: 'abc' }))
  })

  it('writes under the base version and replaces the same target at any other version', () => {
    const storage = memoryStorage()
    storage.setItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'), JSON.stringify({ proposedText: 'Carried' }))
    writeLocalDraft(storage, SCOPE, draft({ proposedText: 'Kept on v2' }))
    expect(storage.getItem(editDraftKey('maria', 'kanset', 'piece', 1, 'copy_block', 'caption'))).toBeNull()
    expect(JSON.parse(storage.getItem(editDraftKey('maria', 'kanset', 'piece', 2, 'copy_block', 'caption')) ?? '{}'))
      .toMatchObject({ proposedText: 'Kept on v2', savedAt: '2026-10-03T10:00:00.000Z', label: 'Caption' })
  })

  it('removes only the named target and frame', () => {
    const storage = memoryStorage()
    writeLocalDraft(storage, SCOPE, draft({ kind: 'asset', key: 'reel', anchor: 'frame:1' }))
    writeLocalDraft(storage, SCOPE, draft({ kind: 'asset', key: 'reel', anchor: 'frame:2' }))
    removeLocalDraft(storage, PREFIX, { kind: 'asset', key: 'reel', anchor: 'frame:1' })
    expect(readLocalDrafts(storage, PREFIX).map((entry) => entry.anchor)).toEqual(['frame:2'])
  })
})
