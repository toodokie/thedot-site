import { describe, expect, it } from 'vitest'
import { getPlannedReviewTiming } from './planned-review-date'

describe('planned review timing', () => {
  it('shows the weekday and calendar date for upcoming review items', () => {
    expect(getPlannedReviewTiming('2026-08-11', '2026-08-09')).toEqual({ label: 'Tuesday · Aug 11', postingNote: null })
    expect(getPlannedReviewTiming('2026-08-12', '2026-08-09')).toEqual({ label: 'Wednesday · Aug 12', postingNote: null })
  })

  it('keeps immediate dates and explains the next step for overdue reviews', () => {
    expect(getPlannedReviewTiming('2026-08-09', '2026-08-09')).toEqual({ label: 'Today · Sunday, Aug 9', postingNote: null })
    expect(getPlannedReviewTiming('2026-08-10', '2026-08-09')).toEqual({ label: 'Tomorrow · Monday, Aug 10', postingNote: null })
    expect(getPlannedReviewTiming('2026-08-08', '2026-08-09')).toEqual({
      label: 'Review overdue',
      postingNote: 'After approval, this will be posted in the next available slot.',
    })
  })

  it('omits the label when no usable planned date exists', () => {
    expect(getPlannedReviewTiming(null, '2026-08-09')).toBeNull()
    expect(getPlannedReviewTiming('not-a-date', '2026-08-09')).toBeNull()
  })
})
