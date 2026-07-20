import { describe, expect, it } from 'vitest'
import {
  computeCostCents,
  createGuardedEmitter,
  serializeContext,
  type AssistantContext,
} from './assistant'

describe('assistant cost accounting', () => {
  it('prices claude-opus-4-8 tokens in cents', () => {
    // 1M input at $5 = 500 cents; 1M output at $25 = 2500 cents
    expect(computeCostCents({ input_tokens: 1_000_000, output_tokens: 0 })).toBe(500)
    expect(computeCostCents({ input_tokens: 0, output_tokens: 1_000_000 })).toBe(2500)
    // typical request: 12k in, 600 out = 6 + 1.5 cents
    expect(computeCostCents({ input_tokens: 12_000, output_tokens: 600 })).toBe(7.5)
  })

  it('bills cache traffic conservatively when present', () => {
    const cents = computeCostCents({
      input_tokens: 1000,
      output_tokens: 0,
      cache_creation_input_tokens: 1000,
      cache_read_input_tokens: 1000,
    })
    // 1000 + 1250 + 100 tokens at 0.0005 cents
    expect(cents).toBe(1.175)
  })
})

describe('guarded streaming emitter', () => {
  it('releases clean chunks as they arrive', () => {
    const released: string[] = []
    const emitter = createGuardedEmitter((chunk) => released.push(chunk))
    emitter.push('Your Friday reel ')
    emitter.push('is scheduled for Jul 24.')
    expect(released.join('')).toBe('Your Friday reel is scheduled for Jul 24.')
    expect(emitter.violated()).toBe(false)
  })

  it('withholds the chunk that completes guarantee language and everything after', () => {
    const released: string[] = []
    const emitter = createGuardedEmitter((chunk) => released.push(chunk))
    emitter.push('Your application ')
    // the violation completes inside this chunk; it must not be released
    emitter.push('is guaranteed to succeed.')
    emitter.push('More text after.')
    expect(released.join('')).toBe('Your application ')
    expect(emitter.violated()).toBe(true)
    // full text is still retained for logging/inspection
    expect(emitter.text()).toContain('guaranteed')
  })

  it('catches a violating phrase split across chunk boundaries', () => {
    const released: string[] = []
    const emitter = createGuardedEmitter((chunk) => released.push(chunk))
    emitter.push('You will ')
    emitter.push('get approved for PR.')
    // "You will " alone is innocuous and may release; the completing chunk must not
    expect(released.join('')).toBe('You will ')
    expect(emitter.violated()).toBe(true)
  })
})

describe('context serialization cap', () => {
  it('passes small contexts through unchanged', () => {
    const context: AssistantContext = {
      content: [{ title: 'A' }], schedule: [], reports: [], recommendations: [],
      library_links: [], ideas: [], invoices: [],
    }
    expect(JSON.parse(serializeContext(context))).toEqual(context)
  })

  it('shrinks oversized contexts below the cap instead of sending them raw', () => {
    const bigRow = { body: 'x'.repeat(3000) }
    const context: AssistantContext = {
      content: Array.from({ length: 200 }, () => ({ ...bigRow })),
      schedule: [], reports: [], recommendations: [],
      library_links: [], ideas: [], invoices: [],
    }
    const serialized = serializeContext(context)
    expect(serialized.length).toBeLessThanOrEqual(300_000)
    // still valid JSON with the shape intact
    const parsed = JSON.parse(serialized)
    expect(Array.isArray(parsed.content)).toBe(true)
    expect(parsed.content.length).toBeGreaterThan(0)
  })
})
