import { describe, expect, it } from 'vitest'
import {
  buildRefreshedCanonical,
  decideAction,
  deriveState,
  extractPack,
  normalizeCopy,
  planVersioning,
  readFactCheckGate,
  readPackContentId,
  reopenCopyApprovedGate,
  validateChangeNote,
} from './update-portal-core'

// A realistic canonical file the live parser accepts (frontmatter + one keyed block + one internal
// marker), used as the "existing authored" target for buildRefreshedCanonical.
const CANONICAL = `---
portal_kind: content
content_id: kanset-2026-07-where-to-start
client: kanset
title: "Where to start"
format: reel
pillar: individual
platforms: [instagram, facebook]
status: draft
version: 3
fact_check: confirmed
fact_check_scope: required
fact_check_ledger:
  - claim_key: start-with-a-consultation
    claim: "A consultation is the right first step for most cases."
    status: confirmed
    source_url: https://www.canada.ca/en/immigration-refugees-citizenship.html
    source_title: "IRCC"
    checked_at: "2026-07-18"
    checked_by_role: agency_fact_checker
---
<!-- portal-block:caption -->
## Instagram + Facebook caption
Not sure where to start? Book a consultation.

<!-- internal -->
Internal note: keep this out of Supabase.
`

// A pack: NOT canonical form — it opens with an H1, a STATUS GATES block (with the gate header
// carrying both ids), a prose fact ledger, THEN the portal-block region, then one internal marker.
function pack(opts: { factCheck?: string; caption?: string; contentId?: string } = {}): string {
  const factCheck = opts.factCheck ?? 'x'
  const caption = opts.caption ?? 'Not sure where to start? Book a consultation.'
  const contentId = opts.contentId ?? 'kanset-2026-07-where-to-start'
  return `# Friday where-to-start reel

**Pillar:** individual
**Source of the material:** internal brief

## ⛔ STATUS GATES
<!-- gates: id=2026-07-25-where-to-start content_id=${contentId} date=2026-07-24 -->
- [${factCheck}] fact-check @anastasia 2026-07-24 | ledger below
- [ ] copy-approved @maria

## Fact ledger
A consultation is the right first step. VERIFIED against IRCC.

<!-- portal-block:caption -->
## Instagram + Facebook caption
${caption}

<!-- internal -->
Reasoning, PII, and links live here and never cross.
`
}

describe('readPackContentId', () => {
  it('reads the canonical content_id from the gate header', () => {
    expect(readPackContentId(pack(), 'p.md')).toEqual({
      packId: '2026-07-25-where-to-start',
      contentId: 'kanset-2026-07-where-to-start',
    })
  })
  it('throws when no gate header exists', () => {
    expect(() => readPackContentId('# no gates here', 'p.md')).toThrow(/No <!-- gates/)
  })
  it('throws on two headers that disagree', () => {
    const twoHeaders = pack() + '\n<!-- gates: id=other content_id=kanset-other date=2026-07-24 -->\n'
    expect(() => readPackContentId(twoHeaders, 'p.md')).toThrow(/Ambiguous content_id/)
  })
  it('throws on an invalid content_id', () => {
    expect(() => readPackContentId(pack({ contentId: 'Bad_Caps' }), 'p.md')).toThrow(/Invalid content_id/)
  })
})

describe('readFactCheckGate', () => {
  it('reads closed / open / na', () => {
    expect(readFactCheckGate(pack({ factCheck: 'x' }))).toBe('closed')
    expect(readFactCheckGate(pack({ factCheck: ' ' }))).toBe('open')
    expect(readFactCheckGate(pack({ factCheck: '~' }))).toBe('na')
  })
  it('reports absent when there is no fact-check gate line', () => {
    expect(readFactCheckGate('# pack with no gates')).toBe('absent')
  })
  it('is section-scoped: a fact-check line OUTSIDE STATUS GATES does not count (Codex B5)', () => {
    // A quoted/example open gate in a notes section must not mask the real closed gate.
    const doc = [
      '## Fact ledger',
      '- [ ] fact-check @someone (this is a quoted example, not the gate)',
      '',
      '## STATUS GATES',
      '- [x] fact-check @anastasia 2026-07-24 | done',
    ].join('\n')
    expect(readFactCheckGate(doc)).toBe('closed')
  })
  it('rejects multiple fact-check markers inside STATUS GATES (ambiguous)', () => {
    const doc = '## STATUS GATES\n- [x] fact-check @a 2026-07-24\n- [ ] fact-check @b 2026-07-24'
    expect(() => readFactCheckGate(doc)).toThrow(/[Mm]ultiple fact-check/)
  })
})

describe('validateChangeNote', () => {
  it('accepts a normal sentence with spaces', () => {
    expect(validateChangeNote('  Reworded the LMIA line per fact-check.  '))
      .toBe('Reworded the LMIA line per fact-check.')
  })
  it('rejects empty, over-long, and multiline notes', () => {
    expect(() => validateChangeNote('   ')).toThrow(/non-empty/)
    expect(() => validateChangeNote('x'.repeat(301))).toThrow(/300/)
    expect(() => validateChangeNote('line one\nline two')).toThrow(/control characters/)
  })
})

describe('planVersioning', () => {
  it('new/unreleased change targets working+1', () => {
    expect(planVersioning({ workingVersion: 0, clientVisibleVersion: 0, canonicalVersion: null, bodyChanged: true }))
      .toMatchObject({ changed: true, newVersion: 1, pendingSync: false, pendingRelease: false })
    expect(planVersioning({ workingVersion: 2, clientVisibleVersion: 0, canonicalVersion: 2, bodyChanged: true }))
      .toMatchObject({ changed: true, newVersion: 3, pendingSync: false })
  })
  it('detects a stranded sync (canonical committed ahead of the DB) — retry, not no-op (B3)', () => {
    // sync failed after commit: canonical is v3, DB working is v2, body now matches canonical.
    expect(planVersioning({ workingVersion: 2, clientVisibleVersion: 0, canonicalVersion: 3, bodyChanged: false }))
      .toMatchObject({ changed: true, pendingSync: true })
  })
  it('detects a stranded release (working ran ahead of client-visible) — retry (B3)', () => {
    // sync succeeded, mark_content_ready failed: working v2, released v1, no body change.
    expect(planVersioning({ workingVersion: 2, clientVisibleVersion: 1, canonicalVersion: 2, bodyChanged: false }))
      .toMatchObject({ changed: true, pendingRelease: true })
  })
  it('no change and nothing stranded is a no-op', () => {
    expect(planVersioning({ workingVersion: 1, clientVisibleVersion: 1, canonicalVersion: 1, bodyChanged: false }))
      .toMatchObject({ changed: false, pendingSync: false, pendingRelease: false, reconcile: false })
  })
  it('a version gap > 1 fails closed (reconcile), never rebuilt to a lower version (Codex SF4)', () => {
    // canonical v4 with DB working v2: rebuilding as v3 would DOWNGRADE the canonical.
    expect(planVersioning({ workingVersion: 2, clientVisibleVersion: 0, canonicalVersion: 4, bodyChanged: false }))
      .toMatchObject({ reconcile: true, pendingSync: false })
  })
  it('a canonical BEHIND the DB fails closed (reconcile)', () => {
    expect(planVersioning({ workingVersion: 3, clientVisibleVersion: 0, canonicalVersion: 2, bodyChanged: false }))
      .toMatchObject({ reconcile: true })
  })
})

describe('reopenCopyApprovedGate', () => {
  const pk = (state: string, extra = '') => [
    '## ⛔ STATUS GATES',
    '<!-- gates: id=p content_id=kanset-p date=2026-07-24 -->',
    `- [${state}] copy-approved @maria 2026-07-24`,
    extra,
    '## Notes',
    '- [x] copy-approved @someone (a quoted example in notes, must NOT be touched)',
  ].join('\n')

  it('flips [x] -> [ ] only inside STATUS GATES, leaving quoted lines alone (Codex SF7)', () => {
    const { text, found } = reopenCopyApprovedGate(pk('x'), 'reworded LMIA line')
    expect(found).toBe(true)
    const gatesLine = text.split('\n').find((l) => l.includes('@maria'))!
    expect(gatesLine).toContain('[ ]')
    expect(gatesLine).toContain('re-armed by update-portal: reworded LMIA line')
    expect(text).toContain('- [x] copy-approved @someone (a quoted example') // untouched
  })
  it('reports not found when the STATUS GATES section has no copy-approved gate', () => {
    const doc = '## ⛔ STATUS GATES\n- [x] fact-check @a 2026-07-24\n## Notes\n- [x] copy-approved @b'
    expect(reopenCopyApprovedGate(doc, 'note').found).toBe(false)
  })
  it('is idempotent when the gate is already open', () => {
    const { text, found } = reopenCopyApprovedGate(pk(' '), 'note')
    expect(found).toBe(true)
    expect(text).toContain('- [ ] copy-approved @maria 2026-07-24')
    expect(text).not.toContain('re-armed by update-portal') // nothing rewritten
  })
})

describe('extractPack', () => {
  it('extracts the client body verbatim from first block to the internal marker', () => {
    const extracted = extractPack(pack(), 'p.md')
    expect(extracted.blockKeys).toEqual(['caption'])
    expect(extracted.clientBody).toContain('<!-- portal-block:caption -->')
    expect(extracted.clientBody).toContain('## Instagram + Facebook caption')
    expect(extracted.clientBody).toContain('Book a consultation.')
    // Nothing before the first block, nothing after the internal marker, crosses over.
    expect(extracted.clientBody).not.toContain('STATUS GATES')
    expect(extracted.clientBody).not.toContain('Fact ledger')
    expect(extracted.clientBody).not.toContain('never cross')
  })
  it('throws when there is not exactly one internal marker', () => {
    expect(() => extractPack('# no marker\n<!-- portal-block:a -->\n## A\nx', 'p.md'))
      .toThrow(/exactly one <!-- internal/)
  })
  it('throws when there is no portal-block region', () => {
    expect(() => extractPack('# nothing\n<!-- internal -->\nnotes', 'p.md'))
      .toThrow(/No <!-- portal-block/)
  })
})

describe('normalizeCopy', () => {
  it('ignores trailing whitespace, indentation, and blank-line runs', () => {
    const a = 'Line one.   \n\n\n   Line two.\n'
    const b = 'Line one.\nLine two.'
    expect(normalizeCopy(a)).toBe(normalizeCopy(b))
  })
  it('treats real word changes as different', () => {
    expect(normalizeCopy('Book a consultation.')).not.toBe(normalizeCopy('Book a call.'))
  })
  it('ignores Markdown formatting (emphasis, list markers, headings) — §4.3', () => {
    expect(normalizeCopy('- **0 to 2s (hook):** Book now'))
      .toBe(normalizeCopy('- 0 to 2s (hook): Book now'))
    expect(normalizeCopy('## Instagram caption')).toBe(normalizeCopy('Instagram caption'))
    expect(normalizeCopy('1. First\n2. Second')).toBe(normalizeCopy('- First\n- Second'))
  })
})

describe('buildRefreshedCanonical', () => {
  it('refreshes the body, preserves frontmatter + internal, and bumps version', () => {
    const extracted = extractPack(pack({ caption: 'New hook. Book a consultation.' }), 'p.md')
    const result = buildRefreshedCanonical(CANONICAL, extracted.clientBody, 4, 'kanset-2026-07-where-to-start.md')
    expect(result).toContain('version: 4')
    expect(result).not.toContain('version: 3')
    expect(result).toContain('New hook. Book a consultation.')
    expect(result).toContain('<!-- internal -->')
    expect(result).toContain('keep this out of Supabase')            // internal section preserved
    expect(result).toContain('content_id: kanset-2026-07-where-to-start') // frontmatter preserved
  })
  it('throws if the canonical has no leading frontmatter', () => {
    expect(() => buildRefreshedCanonical('no frontmatter\n<!-- internal -->\n', 'x', 2, 'c.md'))
      .toThrow(/no leading YAML frontmatter/)
  })
})

describe('decideAction', () => {
  const base = { changed: true, isReshare: false, hasChangeNote: false }
  it('locked always refuses', () => {
    expect(decideAction({ ...base, state: 'locked' }).action).toBe('refuse-locked')
  })
  it('no normalized change is a no-op regardless of state', () => {
    expect(decideAction({ ...base, changed: false, state: 'released' }).action).toBe('noop')
    expect(decideAction({ ...base, changed: false, state: 'unreleased' }).action).toBe('noop')
  })
  it('new + changed creates; unreleased + changed syncs', () => {
    expect(decideAction({ ...base, state: 'new' }).action).toBe('create')
    expect(decideAction({ ...base, state: 'unreleased' }).action).toBe('sync')
  })
  it('released + changed FLAGS ONLY on the default path', () => {
    expect(decideAction({ ...base, state: 'released' }).action).toBe('flag-reshare')
  })
  it('--re-share refuses without a change note, else re-shares', () => {
    expect(decideAction({ ...base, state: 'released', isReshare: true }).action).toBe('refuse-no-change-note')
    expect(decideAction({ ...base, state: 'released', isReshare: true, hasChangeNote: true }).action).toBe('reshare')
  })
  it('locked wins even under --re-share', () => {
    expect(decideAction({ ...base, state: 'locked', isReshare: true, hasChangeNote: true }).action).toBe('refuse-locked')
  })
})

describe('deriveState', () => {
  it('maps the content_items row shape to a state', () => {
    expect(deriveState(null)).toBe('new')
    expect(deriveState({ client_visible_version: null, publication_locked_version: null })).toBe('unreleased')
    expect(deriveState({ client_visible_version: 2, publication_locked_version: null })).toBe('released')
    expect(deriveState({ client_visible_version: 2, publication_locked_version: 2 })).toBe('locked')
  })
})
