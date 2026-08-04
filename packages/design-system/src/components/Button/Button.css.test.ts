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
