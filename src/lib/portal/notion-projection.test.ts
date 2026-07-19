import { describe, expect, it } from 'vitest'
import {
  nextBackoffSeconds, decideProjection, routeObjectType, PROJECTION_OBJECT_TYPES,
} from './notion-projection'

describe('notion projection pure logic', () => {
  it('backoff is exponential, capped at 1h, and matches the SQL helper (30 * 2^attempts)', () => {
    expect(nextBackoffSeconds(1)).toBe(60)
    expect(nextBackoffSeconds(2)).toBe(120)
    expect(nextBackoffSeconds(6)).toBe(1920)
    expect(nextBackoffSeconds(7)).toBe(3600) // 3840 -> capped
    expect(nextBackoffSeconds(20)).toBe(3600)
    for (let a = 1; a < 15; a++) {
      expect(nextBackoffSeconds(a + 1)).toBeGreaterThanOrEqual(nextBackoffSeconds(a))
    }
  })

  it('reconcile forces apply even when the revision already succeeded (drift repair)', () => {
    expect(decideProjection({ operation: 'reconcile', objectRevision: 2, lastSucceededRevision: 5 })).toBe('apply')
  })

  it('skips a stale revision so Notion can never regress', () => {
    expect(decideProjection({ operation: 'upsert', objectRevision: 2, lastSucceededRevision: 2 })).toBe('skip_stale')
    expect(decideProjection({ operation: 'upsert', objectRevision: 2, lastSucceededRevision: 3 })).toBe('skip_stale')
    expect(decideProjection({ operation: 'archive', objectRevision: 1, lastSucceededRevision: 4 })).toBe('skip_stale')
  })

  it('applies a fresh upsert and archives a fresh archive', () => {
    expect(decideProjection({ operation: 'upsert', objectRevision: 3, lastSucceededRevision: 2 })).toBe('apply')
    expect(decideProjection({ operation: 'upsert', objectRevision: 1, lastSucceededRevision: null })).toBe('apply')
    expect(decideProjection({ operation: 'archive', objectRevision: 3, lastSucceededRevision: 2 })).toBe('archive')
  })

  it('routes known object types and throws (never silently drops) on unknown ones', () => {
    for (const t of PROJECTION_OBJECT_TYPES) expect(routeObjectType(t)).toBe(t)
    expect(() => routeObjectType('secret_internal')).toThrow(/unknown projection object_type/)
  })
})
