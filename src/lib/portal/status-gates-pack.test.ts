import { describe, expect, it } from 'vitest'
import { patchStatusGatesBlock } from './status-gates-pack'

const rendered = [
  '## STATUS GATES',
  '<!-- gates: id=kanset-2026-07-pr-two-clocks date=2026-07-28 -->',
  '- [x] fact-check @anastasia 2026-07-28',
  '- [x] design-built @anastasia 2026-07-28',
].join('\n')

describe('patchStatusGatesBlock', () => {
  it('patches the canonical content_id when a pack also carries its legacy filename id', () => {
    const source = [
      '## ✅ STATUS GATES (POSTED)',
      '<!-- gates: id=2026-07-29-pr-two-clocks content_id=kanset-2026-07-pr-two-clocks date=2026-07-27 -->',
      '- [ ] design-built @anastasia',
      '',
      '## Copy',
    ].join('\n')
    const result = patchStatusGatesBlock(source, 'kanset-2026-07-pr-two-clocks', rendered)
    expect(result).toMatchObject({ patched: true })
    if (!result.patched) return
    expect(result.output).toContain('id=2026-07-29-pr-two-clocks content_id=kanset-2026-07-pr-two-clocks date=2026-07-28')
    expect(result.output).toContain('- [x] design-built @anastasia 2026-07-28')
    expect(result.output).toContain('## Copy')
  })

  it('refuses ambiguous exact or normalized identities', () => {
    const source = [
      '## STATUS GATES', '<!-- gates: id=2026-06-piece date=2026-07-28 -->', '- [ ] design-built @anastasia',
      '## STATUS GATES', '<!-- gates: id=2026-08-piece date=2026-07-28 -->', '- [ ] design-built @anastasia',
    ].join('\n')
    expect(patchStatusGatesBlock(source, 'kanset-2026-07-piece', rendered)).toEqual({ patched: false, reason: 'ambiguous' })
  })

  it('does not patch a copied marker outside a STATUS GATES section', () => {
    const source = [
      '## Notes', '<!-- gates: id=kanset-2026-07-pr-two-clocks date=2026-07-27 -->', '- [ ] design-built @anastasia',
    ].join('\n')
    expect(patchStatusGatesBlock(source, 'kanset-2026-07-pr-two-clocks', rendered)).toEqual({ patched: false, reason: 'not_found' })
  })

  it('keeps a closed local production gate when the portal has no value for it', () => {
    // The portal owns approval, schedule, posting and link confirmation. It does NOT
    // hold source-in-hand, design-built, proofed or approval-sent unless those were
    // separately emitted with `portal-write gate`. Regenerating must never replace a
    // closed local production gate, with its provenance note, with an empty portal row.
    const portalRendered = [
      '## STATUS GATES',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-12 -->',
      '- [ ] source-in-hand @studio',
      '- [ ] design-built @anastasia',
      '- [ ] proofed @anastasia',
      '- [ ] approval-sent @anastasia',
      '- [x] posted:instagram @anastasia',
      '- [x] link-confirmed:instagram @anastasia 2026-09-08 | https://instagram.com/reel/abc',
    ].join('\n')
    const source = [
      '## ⛔ STATUS GATES (NOT ready to post)',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-08 -->',
      '- [x] source-in-hand @agent 2026-09-03 | Studio Reel 5 verified at 1080x1920, 30 fps.',
      '- [x] design-built @agent 2026-09-08 | Corrected v3 exports delivered to the dated Drive folder.',
      '- [x] proofed @agent 2026-09-08 | All v3 exports passed full decode.',
      '- [x] approval-sent @agent 2026-09-08 | Canonical version 2 released.',
      '- [ ] posted:instagram @anastasia',
      '- [ ] link-confirmed:instagram @anastasia',
      '',
      '## Copy',
    ].join('\n')
    const result = patchStatusGatesBlock(source, 'kanset-2026-09-medical', portalRendered)
    expect(result).toMatchObject({ patched: true })
    if (!result.patched) return
    // local production provenance survives
    expect(result.output).toContain('Studio Reel 5 verified at 1080x1920, 30 fps.')
    expect(result.output).toContain('- [x] design-built @agent 2026-09-08')
    expect(result.output).toContain('- [x] proofed @agent 2026-09-08')
    expect(result.output).toContain('- [x] approval-sent @agent 2026-09-08')
    // portal-owned gates are taken from the portal
    expect(result.output).toContain('- [x] posted:instagram @anastasia')
    expect(result.output).toContain('- [x] link-confirmed:instagram @anastasia 2026-09-08 | https://instagram.com/reel/abc')
    expect(result.output).toContain('## Copy')
  })

  it('lets the portal win a production gate when the portal actually holds one', () => {
    const portalRendered = [
      '## STATUS GATES',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-12 -->',
      '- [x] design-built @anastasia 2026-09-10 | emitted via portal-write gate',
    ].join('\n')
    const source = [
      '## STATUS GATES',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-08 -->',
      '- [x] design-built @agent 2026-09-08 | stale local note',
    ].join('\n')
    const result = patchStatusGatesBlock(source, 'kanset-2026-09-medical', portalRendered)
    expect(result).toMatchObject({ patched: true })
    if (!result.patched) return
    expect(result.output).toContain('emitted via portal-write gate')
    expect(result.output).not.toContain('stale local note')
  })

  it('does not resurrect a local production gate the portal explicitly reopened', () => {
    // `[~]` and a note are real portal values, not emptiness.
    const portalRendered = [
      '## STATUS GATES',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-12 -->',
      '- [~] proofed @anastasia | not applicable, no video',
    ].join('\n')
    const source = [
      '## STATUS GATES',
      '<!-- gates: id=x content_id=kanset-2026-09-medical date=2026-09-08 -->',
      '- [x] proofed @agent 2026-09-08 | old note',
    ].join('\n')
    const result = patchStatusGatesBlock(source, 'kanset-2026-09-medical', portalRendered)
    expect(result).toMatchObject({ patched: true })
    if (!result.patched) return
    expect(result.output).toContain('not applicable, no video')
    expect(result.output).not.toContain('old note')
  })
})
