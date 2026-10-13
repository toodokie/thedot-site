import { describe, expect, it } from 'vitest'
import { parseGateFile, fileTuple } from './gate-sync-parse'

// Excerpts below are copied from real packs in ~/Kanset/content/ (read only), trimmed for length.
const pack = (body: string, cid = 'kanset-x') =>
  `# Pack\n\n## STATUS GATES\n\n<!-- gates: id=x content_id=${cid} -->\n${body}\n\n## Next\n`

function only(text: string) {
  const { blocks } = parseGateFile(text, 'pack.md')
  expect(blocks).toHaveLength(1)
  return blocks[0]
}

describe('parseGateFile', () => {
  it('parses the ep3 red flags block: four agency gates, parenthetical note kept, bare out-of-scope lines ignored', () => {
    const b = only(pack([
      '- [x] fact-check @agent 2026-10-04 | brand-only exemption: recorded speech, no agency programme claim',
      '- [x] source-in-hand @agent 2026-10-04 | retouched ep3 master, span 1203.7 to 1514.3, boundaries in silence',
      '- [x] design-built (v1, superseded) @agent 2026-10-04 | `design-source/x.mp4`, 1920x1080',
      '- [x] proofed @anastasia 2026-10-04 | "i love it" (v2, no opening title card)',
      '- [x] approval-sent @agent 2026-10-04 | v1 synced (brand-only exemption)',
      '- [ ] copy-approved @maria',
      '- [ ] scheduled',
      '- [ ] posted',
      '- [ ] link-confirmed',
    ].join('\n'), 'kanset-2026-10-ep3-red-flags-long'))
    expect(b.contentId).toBe('kanset-2026-10-ep3-red-flags-long')
    expect(b.gates.map((g) => [g.gateKey, g.state, g.owner, g.date])).toEqual([
      ['source-in-hand', 'done', 'agent', '2026-10-04'],
      ['design-built', 'done', 'agent', '2026-10-04'],
      ['proofed', 'done', 'anastasia', '2026-10-04'],
      ['approval-sent', 'done', 'agent', '2026-10-04'],
    ])
    expect(b.gates[1].note).toBe('(v1, superseded) `design-source/x.mp4`, 1920x1080')
    // The bare `- [ ] scheduled` lines are gates the sync never writes: a warning, never a block failure.
    expect(b.warnings.length).toBe(3)
    expect(b.warnings.every((w) => /not synced here/.test(w))).toBe(true)
  })

  it('keeps an open agency gate with an owner (remote work: proofed open)', () => {
    const b = only(pack([
      '- [x] source-in-hand @agent 2026-10-03 | clip 4, 17.684 s, no trim',
      '- [ ] proofed @anastasia',
    ].join('\n')))
    expect(b.gates.map((g) => [g.gateKey, g.state, g.owner])).toEqual([
      ['source-in-hand', 'done', 'agent'],
      ['proofed', 'open', 'anastasia'],
    ])
    expect(b.warnings).toEqual([])
  })

  it('maps the_dot and codex owners to agent', () => {
    const b = only(pack([
      '- [x] source-in-hand @the_dot 2026-08-20 | studio clip in hand',
      '- [x] design-built @codex 2026-09-05 | cover built',
    ].join('\n')))
    expect(b.gates.map((g) => g.owner)).toEqual(['agent', 'agent'])
    expect(b.warnings).toEqual([])
  })

  it('a bad line skips only that line (foreign worker cost reel)', () => {
    const b = only(pack([
      '- [x] fact-check @agent 2026-09-25 | ledger',
      '- [x] source-in-hand @agent | n/a, animated graphics, no filmed source',
      '- [x] design-built @agent 2026-09-25 | v2',
      '- [x] proofed @agent 2026-09-25 | ffprobe, geometry assertions',
      '- [x] proofed @anastasia 2026-09-25 | v2 "okay"',
      '- [ ] anastasia-approved @anastasia | awaiting her visual review',
      '- [x] approval-sent @agent 2026-09-25 | v1 synced to portal',
      '- [ ] copy-approved @maria',
      '- [ ] scheduled:instagram',
      '- [x] posted @anastasia 2026-10-02 | posted by Anastasia',
      '- [x] TAKEN DOWN @anastasia | Maria asked for it to be taken down',
      '- [ ] link-confirmed | n/a, taken down',
    ].join('\n')))
    // source-in-hand: done without a date -> skipped. proofed: two lines -> ambiguous, both skipped.
    expect(b.gates.map((g) => g.gateKey)).toEqual(['design-built', 'approval-sent'])
    const w = b.warnings.join('\n')
    expect(w).toMatch(/source-in-hand: done without a date/)
    expect(w).toMatch(/proofed: 2 lines for this gate/)
    expect(w).toMatch(/unknown gate key 'anastasia-approved'/)
    expect(w).toMatch(/not a gate line: - \[x\] TAKEN DOWN/)
  })

  it('never invents an owner: an agency gate line without @owner is skipped', () => {
    const b = only(pack([
      '- [ ] design-built | covers, teaser, trailer not started',
      '- [~] design-built-x @agent | typo',
      '- [ ] proofed',
    ].join('\n')))
    expect(b.gates).toEqual([])
    expect(b.warnings.join('\n')).toMatch(/design-built: no @owner/)
    expect(b.warnings.join('\n')).toMatch(/proofed: no @owner/)
    expect(b.warnings.join('\n')).toMatch(/unknown gate key 'design-built-x'/)
  })

  it('still rejects unknown owners, invalid dates, n/a without reason, destination suffixes and emails per line', () => {
    const b = only(pack([
      '- [x] source-in-hand @maria 2026-09-01 | x',
      '- [x] design-built @agent 2026-02-31 | x',
      '- [~] proofed @agent',
      '- [x] approval-sent:instagram @agent 2026-09-01 | x',
    ].join('\n')))
    expect(b.gates).toEqual([])
    expect(b.warnings).toHaveLength(4)
    const e = only(pack('- [x] proofed @agent 2026-09-01 | sent to someone@example.com'))
    expect(e.gates).toEqual([])
    expect(e.warnings[0]).toMatch(/email address/)
  })

  it('ignores markers outside a STATUS GATES section', () => {
    const { blocks } = parseGateFile('## Notes\n<!-- gates: content_id=kanset-x -->\n- [x] proofed @agent 2026-09-01 | x\n', 'p.md')
    expect(blocks).toEqual([])
  })

  it('fileTuple is unchanged for a normal line (idempotency with rows already synced)', () => {
    const b = only(pack('- [x] proofed @agent 2026-09-01 | note'))
    expect(fileTuple(b.gates[0])).toBe('done|2026-09-01|agent|note|')
  })
})
