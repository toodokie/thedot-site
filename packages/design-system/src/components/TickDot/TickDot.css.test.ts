import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'packages/design-system/src/components/TickDot/TickDot.module.css'),
  'utf8',
)

describe('TickDot look (mockup .tdot)', () => {
  it('is a 14px hairline circle on white', () => {
    expect(css).toMatch(/\.tick\s*\{[^}]*width:\s*14px[^}]*height:\s*14px/)
    expect(css).toMatch(/\.tick\s*\{[^}]*border-radius:\s*var\(--dot-radius-circle\)/)
    expect(css).toMatch(/\.tick\s*\{[^}]*border:\s*1px solid var\(--dot-grey-light\)/)
    expect(css).toMatch(/\.tick\s*\{[^}]*background:\s*var\(--dot-white\)/)
  })

  it('fills with the core yellow dot gradient when checked', () => {
    expect(css).toMatch(/\.checked\s*\{[^}]*border-color:\s*var\(--dot-black\)[^}]*background:\s*var\(--dot-grad-fill\)/)
  })

  it('animates only when the viewer allows motion', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.tick\s*\{\s*transition:/)
  })
})
