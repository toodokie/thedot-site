import { describe, it, expect } from 'vitest'
import { parseClientState } from './state'

describe('parseClientState', () => {
  it('accepts every database state used by the integrated lifecycle', () => {
    for (const state of [
      'needs_review', 'with_dot', 'approved', 'partially_scheduled', 'schedule_failed',
      'scheduled', 'reschedule_pending', 'cancel_pending', 'partially_live',
      'publish_failed', 'live', 'archived',
    ]) {
      expect(parseClientState(state)).toBe(state)
    }
  })
  it('fails loud on a missing or unknown database state', () => {
    expect(() => parseClientState(null)).toThrow(/Unknown client state/)
    expect(() => parseClientState('idea')).toThrow(/Unknown client state/)
  })
})
