import { describe, expect, it } from 'vitest'
import { planHeadsUp, shortMonthDay } from './plan-heads-up'

describe('plan heads-up line', () => {
  it('names the Friday before the week as the deadline while it is still ahead', () => {
    const result = planHeadsUp('2026-09-07', '2026-09-02')
    expect(result?.deadlineIso).toBe('2026-09-04')
    expect(result?.deadlinePassed).toBe(false)
    expect(result?.sentence).toBe(
      'If we have not heard from you by Fri Sep 4, the week runs as planned from Mon Sep 7, and each piece still comes to you for approval before it posts.',
    )
    expect(result?.short).toBe(
      'Runs as planned from Mon Sep 7 unless we hear from you by Fri Sep 4. Each piece still comes to you for approval.',
    )
  })

  it('treats the deadline day itself as still open', () => {
    expect(planHeadsUp('2026-09-07', '2026-09-04')?.deadlinePassed).toBe(false)
  })

  it('uses future wording after the deadline but before the week starts', () => {
    const result = planHeadsUp('2026-09-07', '2026-09-05')
    expect(result?.deadlinePassed).toBe(true)
    expect(result?.sentence).toBe(
      'The week will run as planned from Mon Sep 7. Each piece still comes to you for approval before it posts.',
    )
    expect(result?.short).toBe('Runs as planned from Mon Sep 7. Each piece still comes to you for approval.')
  })

  it('switches to the running wording once the week has started', () => {
    const result = planHeadsUp('2026-09-07', '2026-09-07')
    expect(result?.deadlinePassed).toBe(true)
    expect(result?.sentence).toBe(
      'This week is running as planned from Mon Sep 7. Each piece still comes to you for approval before it posts.',
    )
    expect(result?.short).toBe('Running as planned from Mon Sep 7. Each piece still comes to you for approval.')
  })

  it('returns null for an unusable week start', () => {
    expect(planHeadsUp('not-a-date', '2026-09-02')).toBeNull()
    expect(planHeadsUp('2026-09-07', 'nope')).toBeNull()
    expect(planHeadsUp('2026-02-30', '2026-09-02')).toBeNull()
  })

  it('formats a chip date as month and day', () => {
    expect(shortMonthDay('2026-09-07')).toBe('Sep 7')
    expect(shortMonthDay('garbage')).toBe('garbage')
  })
})
