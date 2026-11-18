// Anastasia, October 30, 2026: remove dates from this review backlog while recorded
// clips continue every other day. This is presentation policy, never an approval.
// It stops applying as soon as a piece is decided or receives a new planned date.
const HELD_CONTENT_IDS = new Set([
  'kanset-2026-10-study-shortlist',
  'kanset-2026-10-ee-employer-nov3',
  'kanset-2026-10-linkedin-ee-employer-nov3',
  'kanset-2026-10-marriage-application-update',
  // Anastasia, November 18, 2026: Maria is away November 18 to 25 and did not review these
  // before leaving. Their November 18 dates were removed; same presentation rule as above.
  'kanset-2026-11-ep5-leave-work-at-work',
  'kanset-2026-11-employer-pr-invitation',
  'kanset-2026-11-linkedin-pr-invitation',
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
