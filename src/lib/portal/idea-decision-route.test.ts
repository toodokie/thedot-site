import { describe, expect, it } from 'vitest'
import { ideaDecisionReturnPath } from './idea-decision-route'

describe('ideaDecisionReturnPath', () => {
  it('returns to the stable content id route rather than the database item UUID', () => {
    expect(ideaDecisionReturnPath('kanset', 'kanset-2026-08-fri-individual'))
      .toBe('/client/kanset/plan/kanset-2026-08-fri-individual')
  })

  it('encodes route segments', () => {
    expect(ideaDecisionReturnPath('client space', 'friday/topic'))
      .toBe('/client/client%20space/plan/friday%2Ftopic')
  })
})
