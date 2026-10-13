import { describe, expect, it } from 'vitest'
import { usesPiecePageV2 } from './piece-page-switch'

describe('usesPiecePageV2', () => {
  it('is off when unset, empty or off', () => {
    expect(usesPiecePageV2('maria@kanset.com', undefined)).toBe(false)
    expect(usesPiecePageV2('maria@kanset.com', '')).toBe(false)
    expect(usesPiecePageV2('maria@kanset.com', ' off ')).toBe(false)
  })

  it('is on for everyone when all', () => {
    expect(usesPiecePageV2('maria@kanset.com', 'ALL')).toBe(true)
  })

  it('is on only for listed seats, case and space insensitive', () => {
    const setting = ' Toodokie@Gmail.com , someone@example.com'
    expect(usesPiecePageV2('toodokie@gmail.com', setting)).toBe(true)
    expect(usesPiecePageV2('maria@kanset.com', setting)).toBe(false)
  })

  it('is off for a seat without an email', () => {
    expect(usesPiecePageV2(null, 'toodokie@gmail.com')).toBe(false)
    expect(usesPiecePageV2('', 'toodokie@gmail.com')).toBe(false)
  })
})
