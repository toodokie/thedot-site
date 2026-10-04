import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css'), 'utf8')

// The body of every `@media (max-width: 767px)` block, joined: the phone rules only.
function phoneRules(source: string): string {
  const out: string[] = []
  const marker = '@media (max-width: 767px) {'
  let at = source.indexOf(marker)
  while (at !== -1) {
    let depth = 1
    let i = at + marker.length
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}') depth--
    }
    out.push(source.slice(at + marker.length, i - 1))
    at = source.indexOf(marker, i)
  }
  return out.join('\n')
}
const phone = phoneRules(css)

describe('piece page stylesheet (spec 10, 10a; mockups v3)', () => {
  it('collapses the header with transform and opacity only, so the page height never changes', () => {
    expect(css).toMatch(/\.cbar\s*\{[^}]*position:\s*fixed[^}]*transform:\s*translateY\(-100%\)[^}]*opacity:\s*0/)
    expect(css).toMatch(/\.cbar\[data-collapsed='true'\]\s*\{[^}]*transform:\s*none[^}]*opacity:\s*1/)
    expect(css).not.toMatch(/\.cbar[^{]*\{[^}]*\bheight:\s*0/)
  })

  it('keeps the condensed bar clear of the phone notch', () => {
    expect(css).toMatch(/\.cbar\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top, 0px\)/)
  })

  it('animates only when the viewer allows motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.cbar\s*\{\s*transition:/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
  })

  it('keeps the decision bar above the safe area and after the sidebar', () => {
    expect(css).toMatch(/\.bar\s*\{[^}]*position:\s*fixed[^}]*left:\s*var\(--portal-sidebar-w, 0px\)[^}]*padding-bottom:\s*env\(safe-area-inset-bottom, 0px\)/)
  })

  it('lays frames four across with no horizontal scroll', () => {
    expect(css).toMatch(/\.fgrid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/)
  })

  it('gives every touch target at least 44px', () => {
    expect(css).toMatch(/\.link\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.tab\s*\{[^}]*min-height:\s*52px/)
    expect(css).toMatch(/\.menuItem\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.ghostButton\s*\{[^}]*min-height:\s*44px[^}]*min-width:\s*44px/)
  })

  it('uses the highlighter token for changed passages and the danger token for failures', () => {
    expect(css).toMatch(/\.changed\s*\{[^}]*background:\s*var\(--dot-grad-highlight-soft\)/)
    expect(css).toMatch(/\.barErr\s*\{[^}]*var\(--dot-danger\)/)
    expect(css).not.toMatch(/#c0392b|#9f241b/i)
  })

  it('takes every colour from a design-system token (no raw hex, rgb or rgba)', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/i)
  })

  it('shows a visible focus ring and no decorative stripe', () => {
    expect(css).toMatch(/:focus-visible\s*\{\s*outline:\s*3px solid var\(--dot-black\)/)
    expect(css).not.toMatch(/stripe/i)
  })

  it('switches to the split view only from 1100px and to the phone layout at 767px', () => {
    expect(css).toMatch(/@media \(min-width: 1100px\)\s*\{\s*\.split\s*\{[^}]*grid-template-columns:\s*var\(--media-col\)/)
    expect(css).toMatch(/@media \(max-width: 767px\)/)
  })

  it('keeps a sent edit disclosure a 44px target, collapsed and read-only (Task 10a)', () => {
    expect(css).toMatch(/\.sentSummary\s*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/\.sentSummary\s*\{[^}]*cursor:\s*pointer/)
    expect(css).toMatch(/\.sentNote\s*\{[^}]*white-space:\s*pre-wrap/)
  })

  it('gives the in-place editor one focus ring, the editor surface own', () => {
    expect(css).not.toMatch(/\.inlineEditor:focus-within/)
  })

  it('keeps Done at the right of every editor toolbar', () => {
    expect(css).toMatch(/\.sheetActions\s*\{[^}]*margin-left:\s*auto/)
  })

  it('puts the header actions top right on a phone, on the kicker row, with the title below', () => {
    expect(phone).toMatch(/\.pheadIn\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/)
    expect(phone).toMatch(/\.crumb\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1/)
    expect(phone).toMatch(/\.hactions\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1/)
    expect(phone).toMatch(/\.headMain\s*\{[^}]*grid-column:\s*1 \/ -1;[^}]*grid-row:\s*2/)
  })

  it('opens the more menu as a bottom sheet on a phone, clear of the home indicator', () => {
    expect(css).toMatch(/\.menuSheet\s*\{[^}]*position:\s*fixed[^}]*left:\s*0[^}]*right:\s*0[^}]*bottom:\s*0/)
    expect(css).toMatch(/\.menuSheet\s*\{[^}]*padding:[^;]*calc\(var\(--dot-space-2\) \+ env\(safe-area-inset-bottom, 0px\)\)/)
    expect(css).toMatch(/\.menuBackdrop\s*\{[^}]*position:\s*fixed[^}]*inset:\s*0[^}]*background:\s*color-mix\(in srgb, var\(--dot-black\)/)
  })

  it('never lets the dropdown menu run wider than the viewport less 16px a side', () => {
    expect(css).toMatch(/\.menu\s*\{[^}]*max-width:\s*calc\(100vw - 32px\)/)
  })
})

