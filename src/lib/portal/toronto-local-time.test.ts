import { describe, expect, it } from 'vitest'
import { resolveTorontoOffset } from './toronto-local-time'

describe('resolveTorontoOffset', () => {
  it('uses daylight time in summer and standard time in winter', () => {
    expect(resolveTorontoOffset('2026-07-15T19:00')).toEqual({ ok: true, offsetMinutes: -240 })
    expect(resolveTorontoOffset('2026-01-15T19:00')).toEqual({ ok: true, offsetMinutes: -300 })
  })

  it('rejects a local time skipped by the spring clock change', () => {
    expect(resolveTorontoOffset('2026-03-08T02:30')).toEqual({ ok: false, reason: 'nonexistent' })
  })

  it('rejects a local time repeated by the fall clock change', () => {
    expect(resolveTorontoOffset('2026-11-01T01:30')).toEqual({ ok: false, reason: 'ambiguous' })
  })

  it('rejects malformed or impossible calendar values', () => {
    expect(resolveTorontoOffset('2026-02-30T12:00')).toEqual({ ok: false, reason: 'invalid' })
    expect(resolveTorontoOffset('not-a-date')).toEqual({ ok: false, reason: 'invalid' })
  })
})
