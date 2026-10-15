import { describe, expect, it } from 'vitest'
import { decidePortalQuiet } from './portal-quiet-check-core'

describe('decidePortalQuiet', () => {
  it('returns quiet when every client activity signal is empty', () => {
    expect(decidePortalQuiet([
      { label: 'Review draft updates', count: 0, latestAt: null },
      { label: 'Client activity events', count: 0, latestAt: null },
    ])).toEqual({ active: false, exitCode: 0, signals: [] })
  })

  it('returns active and sorts the non-empty signals by latest activity', () => {
    const decision = decidePortalQuiet([
      { label: 'Review draft updates', count: 2, latestAt: '2026-10-15T14:00:00.000Z' },
      { label: 'Report views', count: 0, latestAt: null },
      { label: 'Client activity events', count: 1, latestAt: '2026-10-15T14:05:00.000Z' },
    ])

    expect(decision.active).toBe(true)
    expect(decision.exitCode).toBe(2)
    expect(decision.signals.map((signal) => signal.label)).toEqual([
      'Client activity events',
      'Review draft updates',
    ])
  })
})
