import { describe, expect, it } from 'vitest'
import type { ResolvedGate } from './gates'
import {
  clientSignalFromRow, feedbackLine, gateDots, gateSummary, mariaViewLine, parseAnchor,
  postsInLabel, releaseMediaAlertDetail, releaseMediaAlertLine, requestAnchors, requestStateLabel,
  unsentAlertDetail, versionRows, type OpenClientSignalRow, type ReleaseMediaAlert,
} from './agency-ops-core'

const signal = (overrides: Partial<OpenClientSignalRow> = {}): OpenClientSignalRow => ({
  event_id: 'e1', seq: 10, client_id: 'c1', event_type: 'portal_feedback_submitted',
  created_at: '2026-10-03T14:00:00.000Z', actor_name: 'Maria Guerts', content_item_id: null,
  content_key: null, title: null, payload: { rating: 4, comment: 'Much easier on my phone.' },
  ...overrides,
})

describe('clientSignalFromRow', () => {
  it('turns a feedback answer into a resolvable line', () => {
    expect(clientSignalFromRow(signal())).toEqual({
      id: 'e1', kind: 'portal_feedback_submitted', pieceKey: null, pieceTitle: null,
      headline: 'Feedback: 4 of 5', detail: 'Maria: “Much easier on my phone.”',
      createdAt: '2026-10-03T14:00:00.000Z', resolvable: true,
    })
  })

  it('names the piece and the count for a send failure', () => {
    const row = signal({ event_type: 'review_send_failed', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { edit_count: 2, reason_code: 'draft_too_long' } })
    expect(clientSignalFromRow(row)).toMatchObject({
      kind: 'review_send_failed', pieceKey: 'kanset-reel', headline: 'Edits not sent: Hiring cost reel',
      detail: '2 edits refused (draft too long). Her text is saved.',
    })
  })

  it('describes carried-over drafts with both versions', () => {
    const row = signal({ event_type: 'review_drafts_carried_over', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { draft_count: 1, from_version: 1, to_version: 2 } })
    expect(clientSignalFromRow(row)).toMatchObject({
      headline: 'Edits carried to v2: Hiring cost reel', detail: '1 unsent edit written against v1',
    })
  })

  it('drops an event type it does not know', () => {
    expect(clientSignalFromRow(signal({ event_type: 'something_else' }))).toBeNull()
  })
})

describe('dates and lines', () => {
  it('says when a piece posts relative to today (Toronto dates)', () => {
    expect(postsInLabel('2026-10-03', '2026-10-03')).toBe('posts today')
    expect(postsInLabel('2026-10-04', '2026-10-03')).toBe('posts in 1 day')
    expect(postsInLabel('2026-10-06', '2026-10-03')).toBe('posts in 3 days')
    expect(postsInLabel('2026-10-01', '2026-10-03')).toBe('was due Oct 1')
    expect(postsInLabel(null, '2026-10-03')).toBe('no planned date')
  })

  it('describes an unsent-edit alert', () => {
    const now = new Date('2026-10-03T16:00:00.000Z')
    expect(unsentAlertDetail({ oldest_saved_at: '2026-10-02T14:00:00.000Z', planned_date: '2026-10-04' }, '2026-10-03', now))
      .toBe('Saved 26 hours ago · posts in 1 day')
  })

  it('writes the feedback line from the mockup', () => {
    expect(feedbackLine(4, 'Much easier on my phone.')).toBe('Review page: 4 of 5. “Much easier on my phone.”')
    expect(feedbackLine(5, null)).toBe('Review page: 5 of 5. No comment.')
  })

  it('states what Maria sees in one line', () => {
    expect(mariaViewLine({ released: false, decision: null, unsentCount: 0, openEditCount: 0, published: false }))
      .toBe('Not shared with Maria yet')
    expect(mariaViewLine({ released: true, decision: null, unsentCount: 2, openEditCount: 0, published: false }))
      .toBe('2 unsent edits · Approve waiting')
    expect(mariaViewLine({ released: true, decision: null, unsentCount: 0, openEditCount: 1, published: false }))
      .toBe('1 sent edit waiting for you')
    expect(mariaViewLine({ released: true, decision: 'approved', unsentCount: 0, openEditCount: 0, published: false }))
      .toBe('Approved')
    expect(mariaViewLine({ released: true, decision: 'approved', unsentCount: 0, openEditCount: 0, published: true }))
      .toBe('Live')
  })
})

describe('gates and versions', () => {
  const gate = (key: ResolvedGate['key'], state: ResolvedGate['state'], extra: Partial<ResolvedGate> = {}): ResolvedGate =>
    ({ key, state, dest: null, owner: 'anastasia', date: null, note: null, present: true, ...extra })

  it('collapses per-destination gates into one dot per step', () => {
    const dots = gateDots([
      gate('fact-check', 'done', { date: '2026-09-25' }),
      gate('source-in-hand', 'na'),
      gate('design-built', 'done', { date: '2026-09-25' }),
      gate('proofed', 'open'),
      gate('approval-sent', 'open'),
      gate('copy-approved', 'open'),
      gate('scheduled', 'done', { dest: 'instagram', date: '2026-10-01' }),
      gate('scheduled', 'open', { dest: 'youtube' }),
      gate('posted', 'open', { present: false }),
      gate('link-confirmed', 'open'),
    ])
    expect(dots.map((dot) => [dot.key, dot.state, dot.date])).toEqual([
      ['fact-check', 'done', '2026-09-25'], ['source-in-hand', 'na', null], ['design-built', 'done', '2026-09-25'],
      ['proofed', 'open', null], ['approval-sent', 'open', null], ['copy-approved', 'open', null],
      ['scheduled', 'open', null], ['posted', 'absent', null], ['link-confirmed', 'open', null],
    ])
    expect(gateSummary(dots)).toBe('2 of 9 gates')
  })

  it('labels versions working, shared and superseded', () => {
    expect(versionRows([
      { version: 1, synced_at: '2026-09-25T12:00:00Z' },
      { version: 2, synced_at: '2026-09-30T12:00:00Z' },
      { version: 3, synced_at: '2026-10-02T12:00:00Z' },
    ], 3, 2)).toEqual([
      { version: 3, label: 'v3 working, not shared yet', date: '2026-10-02' },
      { version: 2, label: 'v2 shared with Maria', date: '2026-09-30' },
      { version: 1, label: 'v1 superseded', date: '2026-09-25' },
    ])
  })
})

describe('requests', () => {
  it('names every request state in plain words', () => {
    expect(requestStateLabel('pending')).toBe('Open')
    expect(requestStateLabel('applying')).toBe('Being applied')
    expect(requestStateLabel('prepared')).toBe('Being applied')
    expect(requestStateLabel('applied')).toBe('Applied')
    expect(requestStateLabel('rejected')).toBe('Declined')
    expect(requestStateLabel('superseded')).toBe('Superseded')
    expect(requestStateLabel('conflicted')).toBe('Needs attention')
    expect(requestStateLabel('mystery')).toBe('mystery')
  })

  it('parses frame and page anchors', () => {
    expect(parseAnchor('frame:3', 'Frame 3 (0:04)')).toEqual({ kind: 'frame', index: 3, label: 'Frame 3 (0:04)' })
    expect(parseAnchor('page:2', null)).toEqual({ kind: 'page', index: 2, label: 'Page 2' })
    expect(parseAnchor('', null)).toBeNull()
    expect(parseAnchor('frame:x', null)).toBeNull()
  })

  it('finds the frames a sent visual request was written on', () => {
    const anchors = requestAnchors('r1', 'reel-video', [
      { id: 'b1', request_ids: ['r1', 'r2'] },
      { id: 'b2', request_ids: ['r9'] },
    ], [
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:3', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:1', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'asset', target_key: 'reel-video', anchor: '', anchor_label: null },
      { sent_bundle_id: 'b1', target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null },
      { sent_bundle_id: 'b2', target_kind: 'asset', target_key: 'reel-video', anchor: 'frame:5', anchor_label: null },
    ])
    expect(anchors.map((anchor) => anchor.index)).toEqual([1, 3])
  })
})

describe('media signals (amended 2026-10-03)', () => {
  it('names a failed play with the device and browser', () => {
    const row = signal({ event_type: 'review_playback_failed', content_key: 'kanset-reel', title: 'Hiring cost reel',
      payload: { media_kind: 'video', device: 'iPhone', browser: 'Safari', error_code: 'media_err_network', content_version: 2 } })
    expect(clientSignalFromRow(row)).toMatchObject({
      kind: 'review_playback_failed', pieceKey: 'kanset-reel', resolvable: true,
      headline: "Maria's video didn't play: iPhone, Safari",
      detail: 'Hiring cost reel v2 · network error',
    })
  })

  it('says pages for a page preview', () => {
    const row = signal({ event_type: 'review_playback_failed', title: 'Carousel',
      payload: { media_kind: 'pages', device: 'Mac', browser: 'Chrome', error_code: 'unknown', content_version: 1 } })
    expect(clientSignalFromRow(row)?.headline).toBe("Maria's pages didn't load: Mac, Chrome")
  })

  const alert = (overrides: Partial<ReleaseMediaAlert> = {}): ReleaseMediaAlert => ({
    client_id: 'c', content_item_id: 'i', content_key: 'kanset-article', title: 'Work permit article',
    content_version: 3, planned_date: '2026-10-06', waiting_on: 'review', override_reason: null, ...overrides,
  })

  it('describes a piece with Maria that has nothing to look at', () => {
    expect(releaseMediaAlertLine(alert())).toBe('No media on Work permit article v3: Maria is reviewing it')
    expect(releaseMediaAlertLine(alert({ waiting_on: 'posting' }))).toBe('No media on Work permit article v3: approved, not live yet')
    expect(releaseMediaAlertDetail(alert(), '2026-10-03')).toBe('Attach a review asset, preview or design link · posts in 3 days')
    expect(releaseMediaAlertDetail(alert({ override_reason: 'Approved by Anastasia: article, no visual' }), '2026-10-03'))
      .toBe('Approved by Anastasia: article, no visual · posts in 3 days')
  })
})
