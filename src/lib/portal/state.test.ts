import { describe, it, expect } from 'vitest'
import { parseClientState, clientStateLabel, type ClientState } from './state'

const ALL_STATES: ClientState[] = [
  'needs_review', 'with_dot', 'approved', 'partially_scheduled', 'schedule_failed',
  'scheduled', 'reschedule_pending', 'cancel_pending', 'partially_live',
  'publish_failed', 'live', 'archived',
]

describe('parseClientState', () => {
  it('accepts every database state used by the integrated lifecycle', () => {
    for (const state of ALL_STATES) {
      expect(parseClientState(state)).toBe(state)
    }
  })
  it('fails loud on a missing or unknown database state', () => {
    expect(() => parseClientState(null)).toThrow(/Unknown client state/)
    expect(() => parseClientState('idea')).toThrow(/Unknown client state/)
  })
})

// Audit B4: raw state tokens never render in client prose. Every state has a client
// wording that completes "This piece is ___." with no enum underscores.
describe('clientStateLabel', () => {
  it('gives every state a token-free client wording', () => {
    for (const state of ALL_STATES) {
      const label = clientStateLabel(state)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toMatch(/_/)
    }
  })
  it('maps the states live in the launch dataset to the agreed wording', () => {
    expect(clientStateLabel('partially_live')).toBe('posted (some platforms not yet verified)')
    expect(clientStateLabel('live')).toBe('posted')
    expect(clientStateLabel('with_dot')).toBe('back with The Dot')
  })
})
