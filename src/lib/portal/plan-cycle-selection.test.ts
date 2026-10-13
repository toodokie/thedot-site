import { describe, expect, it } from 'vitest'
import { selectActivePlanCycles, selectCurrentPlanCycle, selectOpenPlanCycles } from './plan-cycle-selection'

const cycle = (id: string, weekStart: string, weekEnd: string, status: string, revision = 1) => ({
  id, week_start: weekStart, week_end: weekEnd, status, revision,
})

describe('selectCurrentPlanCycle', () => {
  it('chooses the nearest submitted plan, not the furthest-future one', () => {
    const result = selectCurrentPlanCycle([
      cycle('aug-11', '2026-08-10', '2026-08-14', 'submitted'),
      cycle('aug-3', '2026-08-03', '2026-08-07', 'submitted'),
      cycle('jul-27', '2026-07-27', '2026-07-31', 'approved', 3),
    ], '2026-07-31')
    expect(result?.id).toBe('aug-3')
  })

  it('keeps a pending upcoming decision visible even while this week is approved', () => {
    const result = selectCurrentPlanCycle([
      cycle('current-approved', '2026-08-03', '2026-08-07', 'approved'),
      cycle('next-submitted', '2026-08-10', '2026-08-14', 'submitted'),
    ], '2026-08-04')
    expect(result?.id).toBe('next-submitted')
  })

  it('falls back to the nearest non-closed plan when nothing needs a decision', () => {
    const result = selectCurrentPlanCycle([
      cycle('later', '2026-08-10', '2026-08-14', 'approved'),
      cycle('nearer', '2026-08-03', '2026-08-07', 'approved'),
      cycle('closed', '2026-08-01', '2026-08-02', 'closed'),
    ], '2026-08-01')
    expect(result?.id).toBe('nearer')
  })

  it('does not revive ended or closed cycles', () => {
    const result = selectCurrentPlanCycle([
      cycle('ended-open', '2026-07-20', '2026-07-24', 'submitted'),
      cycle('closed-next', '2026-08-03', '2026-08-07', 'closed'),
    ], '2026-07-31')
    expect(result).toBeNull()
  })

  it('never treats an upcoming draft as an approval cycle', () => {
    const result = selectCurrentPlanCycle([
      cycle('aug-3', '2026-08-03', '2026-08-07', 'submitted'),
      cycle('aug-10-draft', '2026-08-10', '2026-08-14', 'draft'),
    ], '2026-07-31')
    expect(result?.id).toBe('aug-3')
  })

  it('returns no current plan when only an upcoming draft exists', () => {
    expect(selectCurrentPlanCycle([
      cycle('aug-10-draft', '2026-08-10', '2026-08-14', 'draft'),
    ], '2026-07-31')).toBeNull()
  })

  it('keeps every submitted future week in the client approval queue', () => {
    expect(selectOpenPlanCycles([
      cycle('aug-17', '2026-08-17', '2026-08-21', 'submitted'),
      cycle('aug-3', '2026-08-03', '2026-08-07', 'submitted'),
      cycle('aug-10', '2026-08-10', '2026-08-14', 'change_requested'),
      cycle('draft', '2026-08-24', '2026-08-28', 'draft'),
    ], '2026-08-02').map((row) => row.id)).toEqual(['aug-3', 'aug-10', 'aug-17'])
  })

  it('keeps approved and submitted weeks on the calendar, but not drafts', () => {
    expect(selectActivePlanCycles([
      cycle('approved-current', '2026-08-03', '2026-08-07', 'approved'),
      cycle('submitted-next', '2026-08-10', '2026-08-14', 'submitted'),
      cycle('draft-later', '2026-08-17', '2026-08-21', 'draft'),
      cycle('closed', '2026-08-03', '2026-08-07', 'closed'),
    ], '2026-08-02').map((row) => row.id)).toEqual(['approved-current', 'submitted-next'])
  })
})
