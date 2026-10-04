import { describe, expect, it } from 'vitest'
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { CopyTab } from './copy-tabs'
import { appliedChanges, changedParagraphs, splitParagraphs, updatedAreasLine, updatedTabKeys } from './changed-passages'

function request(overrides: Partial<ContentRequestRow>): ContentRequestRow {
  return {
    id: 'r', client_id: 'c', content_id: 'i', request_type: 'edit', base_version: 1, payload: {},
    status: 'applied', requester_name: 'Maria', created_at: '', updated_at: '', reconciled_at: null,
    reconciled_by: null, canonical_version: 2, resolution_note: null, canonical_content_key: null,
    base_copy_text: null, ...overrides,
  }
}

const tabs: CopyTab[] = [
  { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel', body: '' }] },
  { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: '' }] },
  { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [{ key: 'youtube-package', label: 'YT', body: '' }] },
]

describe('changed paragraphs', () => {
  it('splits on blank lines', () => {
    expect(splitParagraphs('a\nb\n\n\nc\n')).toEqual(['a\nb', 'c'])
  })

  it('marks paragraphs that are new or edited', () => {
    expect(changedParagraphs('One.\n\nTwo.', 'One.\n\nTwo, edited.\n\nThree.')).toEqual([false, true, true])
    expect(changedParagraphs(null, 'One.')).toEqual([false])
  })
})

describe('applied changes on this version', () => {
  const requests = [
    request({ id: 'a', payload: { target_kind: 'copy_block', target_key: 'social-caption' }, base_copy_text: 'Old caption.' }),
    request({ id: 'b', payload: { target_kind: 'asset', target_key: 'reel-cover' } }),
    request({ id: 'c', payload: { target_key: 'youtube-package' }, canonical_version: 1 }),
    request({ id: 'd', payload: { target_key: 'reel-script' }, status: 'pending', canonical_version: null }),
  ]

  it('collects copy blocks with their previous text, and whether visuals changed', () => {
    const changes = appliedChanges(2, requests)
    expect([...changes.before.entries()]).toEqual([['social-caption', 'Old caption.']])
    expect(changes.visualsChanged).toBe(true)
  })

  it('puts the dot on changed tabs and names them under the title', () => {
    const changes = appliedChanges(2, requests)
    const keys = updatedTabKeys(tabs, changes)
    expect([...keys]).toEqual(['caption'])
    expect(updatedAreasLine(tabs, keys, changes.visualsChanged)).toBe('caption, visuals')
    expect(updatedAreasLine(tabs, new Set(['onscreen', 'youtube']), false)).toBe('on-screen text, YouTube')
  })
})

describe('appliedChanges and updatedTabKeys coverage', () => {
  const edit = (overrides: Partial<ContentRequestRow>) => request({
    payload: { target_kind: 'copy_block', target_key: 'social-caption' }, base_copy_text: 'Old.', ...overrides,
  })

  it('ignores requests that are not applied or superseded', () => {
    expect(appliedChanges(2, [edit({ status: 'pending' })]).before.size).toBe(0)
    expect(appliedChanges(2, [edit({ status: 'superseded' })]).before.size).toBe(1)
  })

  it('ignores requests applied to another version', () => {
    expect(appliedChanges(2, [edit({ canonical_version: 1 })]).before.size).toBe(0)
    expect(appliedChanges(2, [edit({ canonical_version: 3 })]).before.size).toBe(0)
  })

  it('never puts the dot on a Chapters tab', () => {
    const withChapters: CopyTab[] = [
      ...tabs,
      { key: 'chapters', kind: 'chapters', label: 'Chapters', blocks: [{ key: 'youtube-package', label: 'YT', body: '' }] },
    ]
    const changes = appliedChanges(2, [edit({ payload: { target_kind: 'copy_block', target_key: 'youtube-package' } })])
    expect([...updatedTabKeys(withChapters, changes)]).toEqual(['youtube'])
  })
})
