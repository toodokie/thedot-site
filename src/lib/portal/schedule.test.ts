import { describe, expect, it } from 'vitest'
import { routesToPiecePage, belongsOnPlanSurface, statusAccent } from './schedule'

describe('calendar status accents', () => {
  it('renders verified publication states as Published', () => {
    expect(statusAccent('live')).toBe('grey')
    expect(statusAccent('partially_live')).toBe('grey')
  })

  it('keeps approved and scheduled workflow states locked', () => {
    expect(statusAccent('approved')).toBe('graphite')
    expect(statusAccent('scheduled')).toBe('graphite')
  })

  it('keeps quiet and review-stage work in planning', () => {
    expect(statusAccent('with_dot')).toBe('yellow')
    expect(statusAccent('needs_review')).toBe('yellow')
  })
})

// Client-view audit B1: the two-door contradiction. A released-for-review piece is
// status 'draft' AND client_state 'needs_review' at the same time; the door must route
// on client_state so the piece always lands on its decidable piece page and never on a
// plan subpage saying "still in planning".
describe('piece-vs-plan routing (audit B1)', () => {
  it('routes needs_review to the piece page regardless of status', () => {
    expect(routesToPiecePage('needs_review')).toBe(true)
  })

  it('routes every acted-on or published state to the piece page', () => {
    for (const state of [
      'approved', 'scheduled', 'partially_scheduled', 'schedule_failed',
      'reschedule_pending', 'cancel_pending', 'live', 'partially_live',
      'publish_failed', 'archived',
    ]) {
      expect(routesToPiecePage(state)).toBe(true)
    }
  })

  it('keeps only a quiet with_dot piece on the plan subpage', () => {
    expect(routesToPiecePage('with_dot')).toBe(false)
  })

  it('the Plan list shows quiet drafts and ideas only', () => {
    // the exact B1 shape: released for review while still status=draft
    expect(belongsOnPlanSurface('draft', 'needs_review')).toBe(false)
    expect(belongsOnPlanSurface('draft', 'with_dot')).toBe(true)
    expect(belongsOnPlanSurface('idea', 'with_dot')).toBe(true)
    // produced pieces never render on the Plan list, whatever their state
    expect(belongsOnPlanSurface('approved', 'approved')).toBe(false)
    expect(belongsOnPlanSurface('posted', 'partially_live')).toBe(false)
    // Codex 2026-07-21: a with_dot piece whose status is no longer idea/draft is not a plan
    // page. The plan page resolves routesToPiecePage BEFORE this idea/draft gate, so a stale
    // approved/scheduled link redirects (predicate true above) instead of 404ing, and this
    // odd with_dot+produced combo notFounds rather than rendering a false planning page.
    expect(belongsOnPlanSurface('scheduled', 'with_dot')).toBe(false)
    expect(belongsOnPlanSurface('approved', 'with_dot')).toBe(false)
  })

  // Codex round-2: an EXPLICIT status x state cross-product. routesToPiecePage depends
  // only on state (never status); belongsOnPlanSurface is true iff status is idea/draft
  // AND state is with_dot. The plan page evaluates routesToPiecePage FIRST, so the only
  // cell that renders the plan subpage is (idea|draft) x with_dot; every other cell
  // either redirects to the piece page (routesToPiecePage true) or notFounds.
  describe('status x state cross-product', () => {
    const STATUSES = ['idea', 'draft', 'approved', 'scheduled', 'posted'] as const
    const STATES = ['with_dot', 'needs_review', 'approved', 'scheduled', 'partially_live'] as const
    for (const status of STATUSES) {
      for (const state of STATES) {
        const routes = routesToPiecePage(state)
        const plan = belongsOnPlanSurface(status, state)
        it(`${status} x ${state}: routes=${routes} plan=${plan}`, () => {
          // routing is a pure function of state
          expect(routes).toBe(state !== 'with_dot')
          // plan surface only for a genuinely-planned piece still quietly with The Dot
          expect(plan).toBe((status === 'idea' || status === 'draft') && state === 'with_dot')
          // the two are mutually exclusive: a piece never both routes to its piece page
          // AND belongs on the plan list
          expect(routes && plan).toBe(false)
        })
      }
    }
  })
})
