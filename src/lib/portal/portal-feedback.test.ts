import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANNOUNCEMENT_THIS_VISIT_KEY, FEEDBACK_CLOSED_KEY, FEEDBACK_PROMPT_KEY, readVisitFlag,
  shouldShowFeedback, writeVisitFlag,
} from './portal-feedback'

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks() })

describe('feedback card rules (spec 9.1)', () => {
  const base = { submitted: false, announcementPending: false, closedThisVisit: false, announcementThisVisit: false }

  it('shows until she submits', () => {
    expect(shouldShowFeedback(base)).toBe(true)
    expect(shouldShowFeedback({ ...base, submitted: true })).toBe(false)
  })

  it('stays hidden for the rest of the visit after Close, and returns next visit', () => {
    expect(shouldShowFeedback({ ...base, closedThisVisit: true })).toBe(false)
    expect(shouldShowFeedback({ ...base, closedThisVisit: false })).toBe(true)
  })

  it('never shares a visit with the rollout note', () => {
    expect(shouldShowFeedback({ ...base, announcementPending: true })).toBe(false)
    expect(shouldShowFeedback({ ...base, announcementThisVisit: true })).toBe(false)
  })

  it('keys its storage by prompt so a later prompt starts fresh', () => {
    expect(FEEDBACK_PROMPT_KEY).toBe('review_page_2026_10')
    expect(FEEDBACK_CLOSED_KEY).toBe('kanset-portal:feedback-closed:review_page_2026_10')
    expect(ANNOUNCEMENT_THIS_VISIT_KEY).toBe('kanset-portal:announcement-this-visit')
  })

  it('reads and writes visit flags in session storage', () => {
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(false)
    writeVisitFlag(FEEDBACK_CLOSED_KEY)
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(true)
  })

  it('treats blocked storage as "not set" and never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(readVisitFlag(FEEDBACK_CLOSED_KEY)).toBe(false)
    expect(() => writeVisitFlag(FEEDBACK_CLOSED_KEY)).not.toThrow()
  })
})
