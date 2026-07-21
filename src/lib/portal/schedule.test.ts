import { describe, expect, it } from 'vitest'
import { routesToPiecePage, belongsOnPlanSurface } from './schedule'

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
  })
})
