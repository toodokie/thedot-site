import { describe, expect, it } from 'vitest'
import { COLLAPSE_AT, EXPAND_BELOW, nextCollapsed } from './collapse'

describe('nextCollapsed (hysteresis)', () => {
  it('collapses only past 120 and expands only under 40', () => {
    expect([COLLAPSE_AT, EXPAND_BELOW]).toEqual([120, 40])
    expect(nextCollapsed(false, 120)).toBe(false)
    expect(nextCollapsed(false, 121)).toBe(true)
    expect(nextCollapsed(true, 60)).toBe(true)
    expect(nextCollapsed(true, 40)).toBe(true)
    expect(nextCollapsed(true, 39)).toBe(false)
    expect(nextCollapsed(false, 80)).toBe(false)
  })
})
