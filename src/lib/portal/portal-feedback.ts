// Feedback card rules (spec 9.1, migration 0095). Browser-safe.
// "Visit" = one browser or installed-app session: sessionStorage clears when she closes it.

export const FEEDBACK_PROMPT_KEY = 'review_page_2026_10'
export const FEEDBACK_COMMENT_MAX = 2000
export const FEEDBACK_CLOSED_KEY = `kanset-portal:feedback-closed:${FEEDBACK_PROMPT_KEY}`
export const ANNOUNCEMENT_THIS_VISIT_KEY = 'kanset-portal:announcement-this-visit'

export function shouldShowFeedback(input: {
  submitted: boolean
  announcementPending: boolean
  closedThisVisit: boolean
  announcementThisVisit: boolean
}): boolean {
  if (input.submitted || input.announcementPending) return false
  return !input.closedThisVisit && !input.announcementThisVisit
}

export function readVisitFlag(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

export function writeVisitFlag(key: string): void {
  try {
    window.sessionStorage.setItem(key, '1')
  } catch {
    // Private mode or blocked storage: the card still hides for this page view (component state).
  }
}
