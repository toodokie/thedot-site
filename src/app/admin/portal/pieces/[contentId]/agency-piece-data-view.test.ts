// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { AdminContentRequest } from '../../RequestAdmin'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import {
  buildRequestViews, reviewTickCount, stateBarLine, summarizeDrafts, unsentAlertSentence,
} from './agency-piece-data-view'

const request = (overrides: Partial<AdminContentRequest> = {}): AdminContentRequest => ({
  id: 'r1', clientName: 'Kanset', requestType: 'edit', status: 'pending', requesterName: 'Maria Guerts',
  createdAt: '2026-09-30T15:00:00Z', title: 'Hiring cost reel', contentUuid: 'item', baseVersion: 2,
  resolutionNote: null, reviewCandidate: null, messages: [],
  edit: { targetKind: 'asset', targetKey: 'reel-video', targetLabel: 'Reel', targetUrl: null, blockKey: null,
    blockLabel: null, originalText: null, proposedText: 'Frame 3: Can the headline use the caption wording?' },
  ...overrides,
})
const preview = (version: number, key: string): SignedReviewPreview => ({
  id: `p${version}`, contentItemId: 'item', contentVersion: version, previewKey: key, mediaKind: 'video',
  width: 1080, height: 1920, durationSeconds: 39, videoUrl: 'https://signed/v.mp4', posterUrl: null,
  frames: Array.from({ length: 8 }, (_, i) => ({ label: `Frame ${i + 1}`, url: `https://signed/f${i + 1}.jpg` })),
  expiresAt: '2026-10-03T16:10:00Z',
})
const context = {
  bundles: [{ id: 'b1', request_ids: ['r1', 'r2'] }],
  sentDrafts: [{ sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:3', anchor_label: null }],
  versions: [],
}

describe('buildRequestViews', () => {
  it('shows the frame a visual request was left on, with its thumbnail', () => {
    const [view] = buildRequestViews([request()], context, [preview(2, 'reel-video')])
    expect(view).toMatchObject({ kind: 'visual', heading: 'Frame 3', state: 'Open', date: '2026-09-30' })
    expect(view.thumbs).toEqual([{ label: 'Frame 3', url: 'https://signed/f3.jpg' }])
  })

  it('keeps the frame label when the preview for that version is gone', () => {
    const [view] = buildRequestViews([request()], context, [])
    expect(view.thumbs).toEqual([{ label: 'Frame 3', url: null }])
  })

  it('labels a text request by its block and shows no thumbnail', () => {
    const [view] = buildRequestViews([request({ id: 'r2', status: 'applied', edit: {
      targetKind: 'copy_block', targetKey: 'youtube', targetLabel: null, targetUrl: null, blockKey: 'youtube',
      blockLabel: 'YouTube description', originalText: 'a', proposedText: 'b' } })], context, [])
    expect(view).toMatchObject({ kind: 'text', heading: 'YouTube description', state: 'Applied', thumbs: [] })
  })

  it('ignores requests that are not edits', () => {
    expect(buildRequestViews([request({ requestType: 'archive', edit: null })], context, [])).toEqual([])
  })
})

describe('drafts', () => {
  const draft = (overrides: Record<string, unknown> = {}) => ({
    id: 'd', status: 'unsent', auth_user_id: 'u1', saved_at: '2026-10-02T14:00:00.000Z',
    send_failed_at: null, last_send_error: null, carried_over_to_version: null, ...overrides,
  })

  it('summarises unsent drafts per seat', () => {
    const summary = summarizeDrafts([
      draft(), draft({ id: 'd2', saved_at: '2026-10-03T09:00:00.000Z', send_failed_at: 'x', last_send_error: 'draft_too_long' }),
      draft({ id: 'd3', status: 'sent' }),
      draft({ id: 'd4', auth_user_id: 'u2', carried_over_to_version: 3 }),
    ], new Map([['u1', 'Maria Guerts'], ['u2', 'Kanset Preview (preview)']]))
    expect(summary).toEqual([
      { seatName: 'Maria Guerts', unsentCount: 2, failedCount: 1, carriedCount: 0,
        oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: 'draft_too_long' },
      { seatName: 'Kanset Preview (preview)', unsentCount: 1, failedCount: 0, carriedCount: 1,
        oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null },
    ])
  })

  it('writes the alert sentence from the mockup', () => {
    expect(unsentAlertSentence({ seatName: 'Maria Guerts', unsentCount: 2, failedCount: 0, carriedCount: 0,
      oldestSavedAt: '2026-10-02T14:00:00.000Z', lastError: null }, '2026-10-04', '2026-10-03', new Date('2026-10-03T16:00:00.000Z')))
      .toBe('Maria has 2 unsent edits on this piece, saved 26 hours ago. It posts in 1 day.')
  })
})

describe('review ticks in the bar (0094 stores ticks per seat and version)', () => {
  it('counts only her ticks on tabs the page still shows', () => {
    expect(reviewTickCount(['caption', 'youtube', 'onscreen'], ['caption', 'youtube', 'old-tab'])).toEqual({ done: 2, total: 3 })
  })

  it('leads the bar with her progress while she reviews', () => {
    expect(stateBarLine('Waiting for her review', { done: 2, total: 3 })).toBe('2 of 3 reviewed · Waiting for her review')
  })

  it('shows the plain line when there is no count', () => {
    expect(stateBarLine('Approved', null)).toBe('Approved')
    expect(stateBarLine('Waiting for her review', { done: 0, total: 0 })).toBe('Waiting for her review')
  })
})
