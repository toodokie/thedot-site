// Anastasia, October 30, 2026: remove dates from this review backlog while recorded
// clips continue every other day. This is presentation policy, never an approval.
// It stops applying as soon as a piece is decided or receives a new planned date.
const HELD_CONTENT_IDS = new Set([
  'kanset-2026-10-study-shortlist',
  'kanset-2026-10-ee-employer-nov3',
  'kanset-2026-10-linkedin-ee-employer-nov3',
  'kanset-2026-10-marriage-application-update',
])

export const REVIEW_HOLD_TIMING = {
  label: 'Review overdue',
  postingNote: 'After review, a new posting slot will be set.',
} as const

export function isTemporaryReviewHold(
  slug: string,
  contentId: string,
  state: string,
  plannedDate: string | null,
): boolean {
  return slug === 'kanset' && HELD_CONTENT_IDS.has(contentId)
    && state === 'needs_review' && plannedDate === null
}
