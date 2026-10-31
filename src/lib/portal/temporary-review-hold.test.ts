import { describe, expect, it } from 'vitest'
import { isTemporaryReviewHold, REVIEW_HOLD_TIMING } from './temporary-review-hold'

const id = 'kanset-2026-10-ee-employer-nov3'

describe('temporary review backlog', () => {
  it('keeps the four agreed undated packages visibly overdue', () => {
    for (const contentId of [id, 'kanset-2026-10-study-shortlist',
      'kanset-2026-10-linkedin-ee-employer-nov3', 'kanset-2026-10-marriage-application-update']) {
      expect(isTemporaryReviewHold('kanset', contentId, 'needs_review', null)).toBe(true)
    }
    expect(REVIEW_HOLD_TIMING.label).toBe('Review overdue')
    expect(REVIEW_HOLD_TIMING.postingNote).not.toMatch(/\d/)
  })

  it('does not turn newly undated work, other clients or the active clip queue into overdue reviews', () => {
    expect(isTemporaryReviewHold('another-client', id, 'needs_review', null)).toBe(false)
    expect(isTemporaryReviewHold('kanset-sandbox', id, 'needs_review', null)).toBe(false)
    expect(isTemporaryReviewHold('kanset', 'kanset-2026-11-new-piece', 'needs_review', null)).toBe(false)
    expect(isTemporaryReviewHold('kanset', 'kanset-2026-10-askkanset-book-consultation', 'needs_review', null)).toBe(false)
  })

  it('ends the label after a decision, an edit request or a deliberate new date', () => {
    for (const state of ['approved', 'scheduled', 'live', 'with_dot', 'archived']) {
      expect(isTemporaryReviewHold('kanset', id, state, null)).toBe(false)
    }
    expect(isTemporaryReviewHold('kanset', id, 'needs_review', '2026-11-06')).toBe(false)
  })
})
