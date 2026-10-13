import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  resolve(process.cwd(), 'packages/design-system/src/components/Button/Button.module.css'),
  'utf8',
)

describe('anchor button states', () => {
  it('keeps the black-button label light after the link has been visited', () => {
    expect(css).toMatch(/\.black:visited[\s\S]*?color:\s*var\(--dot-cream\)/)
  })

  it('protects every button variant from global link-state colours', () => {
    expect(css).toContain('.yellow:visited')
    expect(css).toContain('.ghost:visited')
  })
})

describe('yellow primary action glows (spec 10a)', () => {
  it('glows on hover and on keyboard focus, never when disabled', () => {
    expect(css).toMatch(
      /\.yellow:hover:not\(:disabled\):not\(\[aria-disabled='true'\]\),\s*\.yellow:focus-visible:not\(:disabled\):not\(\[aria-disabled='true'\]\)\s*\{[^}]*background:\s*var\(--dot-grad-glow\)/,
    )
  })

  it('no longer flattens the hover to pale yellow', () => {
    expect(css).not.toMatch(/\.yellow:hover\s*\{[^}]*--dot-yellow-pale/)
  })

  it('shows a quiet disabled state for the yellow button only', () => {
    expect(css).toMatch(
      /\.yellow:disabled,\s*\.yellow\[aria-disabled='true'\]\s*\{[^}]*background:\s*var\(--dot-hairline\)[^}]*color:\s*var\(--dot-grey-accessible\)[^}]*border-color:\s*var\(--dot-grey-light\)[^}]*cursor:\s*not-allowed/,
    )
  })
})
