import { describe, expect, it } from 'vitest'
import { COUNTER_FROM_CHARS, MAX_EDIT_CHARS, characterCount } from './limits'

describe('edit limits', () => {
  it('match migration 0088 and the spec', () => {
    expect([MAX_EDIT_CHARS, COUNTER_FROM_CHARS]).toEqual([50_000, 45_000])
  })

  it('count characters the way the database does', () => {
    expect(characterCount('📌 a')).toBe(3)
    expect('📌 a'.length).toBe(4)
  })
})
