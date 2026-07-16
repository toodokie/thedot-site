import { describe, it, expect } from 'vitest'
import { deriveClientState } from './state'
describe('deriveClientState', () => {
  it('needs_review: draft with no decision on current version', () => {
    expect(deriveClientState('draft', null)).toBe('needs_review')
  })
  it('with_dot: change requested leaves her queue', () => {
    expect(deriveClientState('draft', 'change_requested')).toBe('with_dot')
  })
  it('approved when the current version is approved', () => {
    expect(deriveClientState('draft', 'approved')).toBe('approved')
  })
  it('scheduled / live follow file status when no pending decision', () => {
    expect(deriveClientState('scheduled', null)).toBe('scheduled')
    expect(deriveClientState('posted', null)).toBe('live')
  })
  it('lifecycle status wins over a stale approval', () => {
    expect(deriveClientState('scheduled', 'approved')).toBe('scheduled')
    expect(deriveClientState('posted', 'approved')).toBe('live')
  })
  it('an open change request wins over any lifecycle status (never hidden)', () => {
    expect(deriveClientState('idea', 'change_requested')).toBe('with_dot')
    expect(deriveClientState('approved', 'change_requested')).toBe('with_dot')
    expect(deriveClientState('scheduled', 'change_requested')).toBe('with_dot')
    expect(deriveClientState('posted', 'change_requested')).toBe('with_dot')
  })
  it('throws on an unknown status instead of silently queueing it', () => {
    expect(() => deriveClientState('archived' as never, null)).toThrow(/Unknown content status/)
  })
})
