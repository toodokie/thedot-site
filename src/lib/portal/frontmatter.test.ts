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
<!-- portal-block:caption -->
## Caption
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
    expect(r.client_body).not.toContain('portal-block:')
    expect(r.client_body).toContain('Client caption here.')
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
  it('parses explicitly keyed sections into stable copy_blocks and strips control comments', () => {
    const withSections = `---
content_id: kanset-2026-07-oinp-employer
client: kanset
title: "OINP employer job offer carousel"
status: draft
---
<!-- portal-block:instagram-facebook-caption -->
## Instagram + Facebook caption
Thinking about supporting a worker's PR through the OINP?

A strong job offer is the anchor.

<!-- portal-block:hashtags -->
## Hashtags
#OINP #Immigration #HireInOntario

<!-- internal -->
Internal note: verify tiers.`
    const r = parseContentFile(withSections, 'content/portal/x.md')
    expect(r.copy_blocks).toEqual([
      {
        key: 'instagram-facebook-caption',
        label: 'Instagram + Facebook caption',
        body: "Thinking about supporting a worker's PR through the OINP?\n\nA strong job offer is the anchor.",
      },
      { key: 'hashtags', label: 'Hashtags', body: '#OINP #Immigration #HireInOntario' },
    ])
    expect(r.client_body).not.toContain('portal-block:')
    expect(r.client_body.includes('## Instagram + Facebook caption')).toBe(true)
  })
  it('rejects unkeyed headings and duplicate block keys', () => {
    const unkeyed = `---\ncontent_id: a\nclient: kanset\ntitle: x\n---\n## Caption\nx\n<!-- internal -->`
    expect(() => parseContentFile(unkeyed, 'p.md')).toThrow(/portal-block key/)
    const duplicate = `---\ncontent_id: a\nclient: kanset\ntitle: x\n---\n<!-- portal-block:caption -->\n## One\nx\n<!-- portal-block:caption -->\n## Two\ny\n<!-- internal -->`
    expect(() => parseContentFile(duplicate, 'p.md')).toThrow(/Duplicate portal block key/)
  })
  it('handles CRLF without leaking the internal section', () => {
    const crlf = sample.replaceAll('\n', '\r\n')
    const r = parseContentFile(crlf, 'windows.md')
    expect(r.copy_blocks).toEqual([{ key: 'caption', label: 'Caption', body: 'Client caption here.' }])
    expect(r.client_body).not.toContain('Internal note')
    expect(r.internal_notes).toContain('verify revenue tiers')
  })
  it('rejects empty keyed blocks instead of releasing a blank approval surface', () => {
    const empty = `---\ncontent_id: a\nclient: kanset\ntitle: x\n---\n<!-- portal-block:caption -->\n## Caption\n\n<!-- internal -->`
    expect(() => parseContentFile(empty, 'p.md')).toThrow(/body must not be empty/)
  })
  it('rejects non-string scalar fields and platform coercion', () => {
    const numericTitle = `---\ncontent_id: a\nclient: kanset\ntitle: 123\n---\nbody\n<!-- internal -->`
    expect(() => parseContentFile(numericTitle, 'p.md')).toThrow(/title must be a non-empty string/)
    const scalarPlatforms = `---\ncontent_id: a\nclient: kanset\ntitle: x\nplatforms: instagram\n---\nbody\n<!-- internal -->`
    expect(() => parseContentFile(scalarPlatforms, 'p.md')).toThrow(/platforms must be an array/)
  })
})
