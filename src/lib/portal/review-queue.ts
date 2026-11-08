import { getPlannedReviewTiming } from './planned-review-date'
import { isTemporaryReviewHold } from './temporary-review-hold'

type ReviewItem = { content_id: string; planned_date: string | null; state: string }

// This is a display order only. Never reschedule, archive or change a review decision here.
export function groupReviewQueue<T extends ReviewItem>(items: readonly T[], slug: string, todayIso: string) {
  const next: T[] = []
  const overdue: T[] = []
  for (const item of items) {
    if (item.state !== 'needs_review') continue
    const held = isTemporaryReviewHold(slug, item.content_id, item.state, item.planned_date)
    const missedDate = getPlannedReviewTiming(item.planned_date, todayIso)?.label === 'Review overdue'
    ;(held || missedDate ? overdue : next).push(item)
  }
  const byDate = (a: T, b: T) =>
    (a.planned_date ?? '9999-12-31').localeCompare(b.planned_date ?? '9999-12-31')
    || a.content_id.localeCompare(b.content_id)
  return { next: next.sort(byDate), overdue: overdue.sort(byDate) }
}
