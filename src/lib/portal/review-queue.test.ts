import { describe, expect, it } from 'vitest'
import { groupReviewQueue } from './review-queue'

const item = (content_id: string, planned_date: string | null, state = 'needs_review') => ({ content_id, planned_date, state })
const ids = (rows: { content_id: string }[]) => rows.map(row => row.content_id)

describe('overview review priority', () => {
  it('keeps next-week reviews ahead of the dated and temporary undated backlog, without losing a review', () => {
    const reviews = [
      item('nov2-news', '2026-11-02'), item('nov3-student', '2026-11-03'),
      item('nov9-news', '2026-11-09'), item('ep5-full', '2026-11-12'), item('ep5-teaser', '2026-11-12'),
      item('kanset-2026-10-ee-employer-nov3', null), item('kanset-2026-10-linkedin-ee-employer-nov3', null),
      item('kanset-2026-10-marriage-application-update', null), item('kanset-2026-10-study-shortlist', null),
    ]
    const before = structuredClone(reviews)
    const queue = groupReviewQueue(reviews, 'kanset', '2026-11-08')
    expect(ids(queue.next)).toEqual(['nov9-news', 'ep5-full', 'ep5-teaser'])
    expect(queue.overdue).toHaveLength(6)
    expect(new Set(ids([...queue.next, ...queue.overdue]))).toEqual(new Set(ids(reviews)))
    expect(reviews).toEqual(before)
  })

  it('keeps today actionable, and an ordinary undated new review out of the overdue backlog', () => {
    const queue = groupReviewQueue([item('new-undated', null), item('today', '2026-11-08'), item('tomorrow', '2026-11-09')], 'kanset', '2026-11-08')
    expect(ids(queue.next)).toEqual(['today', 'tomorrow', 'new-undated'])
    expect(queue.overdue).toEqual([])
  })

  it('respects the temporary hold client boundary and removes decided pieces from review groups', () => {
    const held = item('kanset-2026-10-study-shortlist', null)
    expect(ids(groupReviewQueue([held], 'kanset-sandbox', '2026-11-08').next)).toEqual([held.content_id])
    const queue = groupReviewQueue(['approved','scheduled','live','with_dot','archived'].map(state => item(state, '2026-11-02', state)), 'kanset', '2026-11-08')
    expect(queue).toEqual({ next: [], overdue: [] })
  })
})
