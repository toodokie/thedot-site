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
    expect(reReviewContext(4, 'needs_review', [request(), request({ id: 'request-2', status: 'superseded', payload: { block_key: 'graphic' } })]))
      .toEqual({ previousVersion: 3, changeCount: 2, changedAreas: ['social caption', 'graphic'] })
  })

  it('does not label a first review or an agency-only revision as a re-review', () => {
    expect(reReviewContext(4, 'needs_review', [])).toBeNull()
    expect(reReviewContext(4, 'approved', [request()])).toBeNull()
    expect(reReviewContext(4, 'needs_review', [request({ canonical_version: 3 })])).toBeNull()
  })

  it('uses clear material names for the review banner', () => {
    expect(reReviewContext(4, 'needs_review', [request({ payload: { block_key: 'graphic' } })]))
      .toMatchObject({ changedAreas: ['graphic'] })
    expect(reReviewContext(4, 'needs_review', [request({ payload: { block_key: 'unexpected' } })]))
      .toMatchObject({ changedAreas: ['review package'] })
  })
})
