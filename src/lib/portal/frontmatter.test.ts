import { describe, it, expect } from 'vitest'
import { parseContentFile } from './frontmatter'
const sample = `---
content_id: kanset-2026-07-oinp-employer
client: kanset
title: "OINP employer job offer carousel"
format: carousel
pillar: employer
platforms: [instagram, facebook]
scheduled_date: "2026-07-16"
status: draft
version: 3
fact_check: confirmed
---
Client caption here.

<!-- internal -->
Internal note: verify revenue tiers before posting.`
describe('parseContentFile', () => {
  it('parses fields, normalizes the date to YYYY-MM-DD, splits client vs internal body', () => {
    const r = parseContentFile(sample, 'content/portal/x.md')
    expect(r.content_id).toBe('kanset-2026-07-oinp-employer')
    expect(r.platforms).toEqual(['instagram', 'facebook'])
    expect(r.scheduled_date).toBe('2026-07-16')      // string, not a Date object
    expect(r.version).toBe(3)
    expect(r.client_body.trim()).toBe('Client caption here.')
    expect(r.internal_notes?.includes('verify revenue tiers')).toBe(true)
  })
  it('rejects a bad status enum', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\nstatus: bogus\n---\nb', 'p.md')).toThrow(/status/)
  })
  it('throws on missing content_id', () => {
    expect(() => parseContentFile('---\ntitle: x\n---\nb', 'p.md')).toThrow(/content_id/)
  })
  it('requires exactly one internal marker (missing marker throws, so notes cannot leak)', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\n---\nbody with no marker', 'p.md')).toThrow(/marker/)
  })
  it('rejects more than one internal marker', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\n---\na\n<!-- internal -->\nb\n<!-- internal -->\nc', 'p.md')).toThrow(/marker/)
  })
  it('rejects an unquoted date (YAML parses it to a Date object)', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\nscheduled_date: 2026-07-16\n---\nb\n<!-- internal -->', 'p.md')).toThrow(/scheduled_date/)
  })
  it('rejects an impossible calendar date', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\nscheduled_date: "2026-02-31"\n---\nb\n<!-- internal -->', 'p.md')).toThrow(/scheduled_date/)
  })
  it('rejects a bad version (must be an integer >= 1, so 0 throws)', () => {
    expect(() => parseContentFile('---\ncontent_id: a\nclient: kanset\ntitle: x\nversion: 0\n---\nb\n<!-- internal -->', 'p.md')).toThrow(/version/)
  })
})
