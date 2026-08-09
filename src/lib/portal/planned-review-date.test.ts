import { describe, expect, it } from 'vitest'
import { formatPlannedReviewDate } from './planned-review-date'

describe('planned review date label', () => {
  it('shows the weekday and calendar date for upcoming review items', () => {
    expect(formatPlannedReviewDate('2026-08-11', '2026-08-09')).toBe('Tuesday · Aug 11')
    expect(formatPlannedReviewDate('2026-08-12', '2026-08-09')).toBe('Wednesday · Aug 12')
  })

  it('makes immediate and overdue items explicit without dropping the weekday', () => {
    expect(formatPlannedReviewDate('2026-08-09', '2026-08-09')).toBe('Today · Sunday, Aug 9')
    expect(formatPlannedReviewDate('2026-08-10', '2026-08-09')).toBe('Tomorrow · Monday, Aug 10')
    expect(formatPlannedReviewDate('2026-08-08', '2026-08-09')).toBe('Overdue · Saturday, Aug 8')
  })

  it('omits the label when no usable planned date exists', () => {
    expect(formatPlannedReviewDate(null, '2026-08-09')).toBeNull()
    expect(formatPlannedReviewDate('not-a-date', '2026-08-09')).toBeNull()
  })
})
