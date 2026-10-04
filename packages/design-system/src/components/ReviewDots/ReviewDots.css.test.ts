import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'packages/design-system/src/components/ReviewDots/ReviewDots.module.css'),
  'utf8',
)

describe('ReviewDots look (mockup .rdots)', () => {
  it('lays the dots out in a row with an 8px gap', () => {
    expect(css).toMatch(/\.row\s*\{[^}]*display:\s*inline-flex[^}]*gap:\s*var\(--dot-space-2\)/)
  })

  it('draws 22px hairline circles on white', () => {
    expect(css).toMatch(/\.dot\s*\{[^}]*width:\s*22px[^}]*height:\s*22px/)
    expect(css).toMatch(/\.dot\s*\{[^}]*border-radius:\s*var\(--dot-radius-circle\)/)
    expect(css).toMatch(/\.dot\s*\{[^}]*border:\s*1px solid var\(--dot-grey-light\)/)
  })

  it('fills with the core yellow radial gradient', () => {
    expect(css).toMatch(/\.on\s*\{[^}]*border-color:\s*var\(--dot-black\)[^}]*background:\s*var\(--dot-grad-fill\)/)
  })

  it('shrinks to 18px on a phone and has a 14px small size', () => {
    expect(css).toMatch(/@media \(max-width: 600px\)\s*\{\s*\.md \.dot\s*\{\s*width:\s*18px;\s*height:\s*18px;/)
    expect(css).toMatch(/\.sm \.dot\s*\{\s*width:\s*14px;\s*height:\s*14px;/)
  })
})
