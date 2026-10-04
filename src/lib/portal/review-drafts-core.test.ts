import { describe, expect, it } from 'vitest'
import {
  DRAFT_STATUS_TEXT, deriveSyncState, draftIdentity, humanizeDraftKey, localEntryToDraft,
  reconcileDrafts, serverRowToDraft, unsentDraftAlertLine, type LocalDraftEntry, type ServerDraftRow,
} from './review-drafts-core'

function row(overrides: Partial<ServerDraftRow> = {}): ServerDraftRow {
  return {
    id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item-1', base_version: 2,
    target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null,
    target_label: 'Caption', url_snapshot: null, quoted_text: null, body: 'Server text',
    status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
    carried_over_at: null, carried_over_to_version: null, send_failed_at: null, last_send_error: null,
    ...overrides,
  }
}

function entry(overrides: Partial<LocalDraftEntry> = {}): LocalDraftEntry {
  return {
    version: 2, targetKind: 'copy_block', targetKey: 'caption', anchor: '', proposedText: 'Local text',
    quotedText: null, savedAt: '2026-10-03T09:00:00.000Z', label: 'Caption', urlSnapshot: null,
    anchorLabel: null, serverId: null, syncedAt: null,
    ...overrides,
  }
}

describe('draft identity', () => {
  it('separates frames of one visual and treats a missing anchor as the whole target', () => {
    expect(draftIdentity({ kind: 'asset', key: 'reel', anchor: 'frame:3' })).toBe('asset:reel:frame:3')
    expect(draftIdentity({ kind: 'copy_block', key: 'caption' })).toBe('copy_block:caption:')
  })

  it('humanises a key when a stored draft has no label', () => {
    expect(humanizeDraftKey('article-body')).toBe('Article body')
    expect(humanizeDraftKey('')).toBe('Edit')
  })
})

describe('mapping', () => {
  it('marks a server draft from an earlier version as carried', () => {
    const draft = serverRowToDraft(row({ base_version: 1, carried_over_to_version: 2, carried_over_at: 'x' }), 2)
    expect(draft).toMatchObject({ baseVersion: 1, carriedFromVersion: 1, serverId: row().id, syncedAt: row().saved_at })
  })

  it('gives a legacy browser draft with no timestamp the oldest possible time', () => {
    const draft = localEntryToDraft(entry({ savedAt: null, label: null, targetKey: 'article-body' }), 2)
    expect(draft.savedAt).toBe('1970-01-01T00:00:00.000Z')
    expect(draft.label).toBe('Article body')
    expect(draft.carriedFromVersion).toBeNull()
  })
})

describe('reconciling the browser buffer with the server', () => {
  it('keeps the newer server text and pushes nothing', () => {
    const result = reconcileDrafts([entry()], [row()], 2)
    expect(Object.values(result.drafts).map((d) => d.proposedText)).toEqual(['Server text'])
    expect(result.push).toEqual([])
    expect(result.dropLocal).toEqual([])
  })

  it('keeps the newer browser text and queues it for the server', () => {
    const result = reconcileDrafts([entry({ savedAt: '2026-10-03T11:00:00.000Z' })], [row()], 2)
    expect(result.drafts['copy_block:caption:']).toMatchObject({ proposedText: 'Local text', serverId: row().id, syncedAt: null })
    expect(result.push).toEqual(['copy_block:caption:'])
  })

  it('lets the server win a tie', () => {
    const result = reconcileDrafts([entry({ savedAt: row().saved_at })], [row()], 2)
    expect(result.drafts['copy_block:caption:'].proposedText).toBe('Server text')
  })

  it('drops a browser copy only when the server already sent or discarded a newer one', () => {
    const sent = reconcileDrafts([entry()], [row({ status: 'sent' })], 2)
    expect(sent.drafts).toEqual({})
    expect(sent.dropLocal).toEqual([{ kind: 'copy_block', key: 'caption', anchor: '' }])
    const newer = reconcileDrafts([entry({ savedAt: '2026-10-03T12:00:00.000Z' })], [row({ status: 'discarded' })], 2)
    expect(newer.drafts['copy_block:caption:'].proposedText).toBe('Local text')
    expect(newer.drafts['copy_block:caption:'].serverId).toBeNull()
    expect(newer.push).toEqual(['copy_block:caption:'])
  })

  it('never loses a browser draft the server has not seen, even from an old version', () => {
    const result = reconcileDrafts([entry({ version: 1, savedAt: null })], [], 2)
    expect(result.drafts['copy_block:caption:']).toMatchObject({ baseVersion: 1, carriedFromVersion: 1 })
    expect(result.push).toEqual(['copy_block:caption:'])
  })

  it('keeps the newest of several browser copies of the same target', () => {
    const result = reconcileDrafts([
      entry({ version: 1, proposedText: 'Old', savedAt: '2026-10-03T08:00:00.000Z' }),
      entry({ version: 2, proposedText: 'New', savedAt: '2026-10-03T08:30:00.000Z' }),
    ], [], 2)
    expect(result.drafts['copy_block:caption:'].proposedText).toBe('New')
  })
})

describe('sync state and wording', () => {
  it('uses the spec wording', () => {
    expect(DRAFT_STATUS_TEXT).toEqual({
      saving: 'Saving…',
      saved: 'Saved · not sent yet',
      offline: 'Saved on this phone · will sync when online',
      send_failed: "Couldn't send. Retry",
    })
  })

  it('derives one state from the provider counters', () => {
    const base = { draftCount: 1, pending: 0, inFlight: false, online: true, sendFailed: false }
    expect(deriveSyncState({ ...base, draftCount: 0 })).toBe('idle')
    expect(deriveSyncState(base)).toBe('saved')
    expect(deriveSyncState({ ...base, pending: 1 })).toBe('saving')
    expect(deriveSyncState({ ...base, inFlight: true })).toBe('saving')
    expect(deriveSyncState({ ...base, pending: 1, online: false })).toBe('offline')
    expect(deriveSyncState({ ...base, sendFailed: true, pending: 1 })).toBe('send_failed')
  })

  it('writes the agency alert line with the first name', () => {
    expect(unsentDraftAlertLine({ seat_name: 'Maria Guerts', unsent_count: 2, title: 'LMIA decoder' }))
      .toBe('Maria has 2 unsent edits on LMIA decoder')
    expect(unsentDraftAlertLine({ seat_name: '', unsent_count: 1, title: 'X' })).toBe('The client has 1 unsent edit on X')
  })
})
