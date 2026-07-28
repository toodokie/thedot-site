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
})
