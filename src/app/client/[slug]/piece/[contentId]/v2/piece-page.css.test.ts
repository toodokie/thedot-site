import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/app/client/[slug]/piece/[contentId]/v2/piece-page.module.css'), 'utf8')

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

  it('gives the in-place editor one focus ring, the editor surface own', () => {
    expect(css).not.toMatch(/\.inlineEditor:focus-within/)
  })
})
