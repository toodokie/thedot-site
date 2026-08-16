import { describe, expect, it } from 'vitest'
import { reReviewContext } from './re-review'
import type { ContentRequestRow } from './requests'

function request(overrides: Partial<ContentRequestRow> = {}): ContentRequestRow {
  return {
    id: 'request-1', client_id: 'client-1', content_id: 'content-1', request_type: 'edit',
    base_version: 3, payload: { block_key: 'ig-caption' }, status: 'applied', requester_name: 'Maria',
    created_at: '2026-07-30T12:00:00Z', updated_at: '2026-07-30T12:00:00Z',
    reconciled_at: null, reconciled_by: null, canonical_version: 4,
    resolution_note: null, canonical_content_key: null,
    ...overrides,
  }
}

describe('reReviewContext', () => {
  it('labels a released version built from resolved client edit feedback', () => {
    expect(reReviewContext(4, 'needs_review', null, [request(), request({ id: 'request-2', status: 'superseded', payload: { block_key: 'graphic' } })]))
      .toEqual({ previousVersion: 3, changeCount: 2, changedAreas: ['social caption', 'graphic copy'], mode: 'decision' })
  })

  it('does not label a first review or an agency-only revision as a re-review', () => {
    expect(reReviewContext(4, 'needs_review', null, [])).toBeNull()
    expect(reReviewContext(4, 'needs_review', null, [request({ canonical_version: 3 })])).toBeNull()
  })

  it('uses clear material names for the review banner', () => {
    expect(reReviewContext(4, 'needs_review', null, [request({ payload: { block_key: 'graphic' } })]))
      .toMatchObject({ changedAreas: ['graphic copy'] })
    expect(reReviewContext(4, 'needs_review', null, [request({ payload: { block_key: 'reel-script' } })]))
      .toMatchObject({ changedAreas: ['on-screen reel copy'] })
    expect(reReviewContext(4, 'needs_review', null, [request({ payload: { block_key: 'unexpected' } })]))
      .toMatchObject({ changedAreas: ['review package'] })
  })

  it('uses clear names for visual requests', () => {
    expect(reReviewContext(4, 'needs_review', null, [request({
      payload: { target_kind: 'asset', target_key: 'youtube-cover' },
    })])).toMatchObject({ changedAreas: ['episode assets'] })
    expect(reReviewContext(4, 'needs_review', null, [request({
      payload: { target_kind: 'design_link', target_key: 'drive' },
    })])).toMatchObject({ changedAreas: ['design'] })
  })

  it('keeps the feedback update visible after an agency courtesy release', () => {
    expect(reReviewContext(4, 'approved', null, [request()]))
      .toEqual({ previousVersion: 3, changeCount: 1, changedAreas: ['social caption'], mode: 'released' })
    expect(reReviewContext(4, 'scheduled', null, [request()]))
      .toMatchObject({ mode: 'released' })
    expect(reReviewContext(4, 'live', null, [request()]))
      .toMatchObject({ mode: 'released' })
  })

  it('stops showing the courtesy-release context after a client decision', () => {
    expect(reReviewContext(4, 'approved', 'approved', [request()])).toBeNull()
    expect(reReviewContext(4, 'with_dot', 'change_requested', [request()])).toBeNull()
  })
})
