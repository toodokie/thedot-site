import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'packages/design-system/src/tokens/tokens.css'), 'utf8')

function token(name: string): string | null {
  const match = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(css)
  return match ? match[1].trim() : null
}

describe('piece page redesign tokens (spec 9.4, 10a)', () => {
  it('defines the off-white panel ground that portal CSS already references', () => {
    expect(token('--dot-off-white')).toBe('#fffefc')
  })

  it('defines one danger colour for errors', () => {
    expect(token('--dot-danger')).toBe('#9f241b')
  })

  it('defines the highlighter for added text, a gradient and never a flat fill', () => {
    expect(token('--dot-grad-highlight')).toBe(
      'linear-gradient(to top, rgba(218,255,0,.62) 0%, rgba(238,251,157,.55) 45%, rgba(250,249,246,0) 72%)',
    )
  })

  it('defines the softer highlighter for updated passages', () => {
    expect(token('--dot-grad-highlight-soft')).toBe(
      'linear-gradient(to top, rgba(238,251,157,.75) 0%, rgba(250,249,246,0) 45%)',
    )
  })

  it('defines the yellow glow used by the primary button on hover and focus', () => {
    expect(token('--dot-grad-glow')).toBe(
      'radial-gradient(circle farthest-corner at 50% 50%, #daff00 0%, #eefb9d 62%, #faf9f6 100%)',
    )
  })

  it('keeps the core dot fill the review dots rely on', () => {
    expect(token('--dot-grad-fill')).toBe('radial-gradient(circle farthest-corner at 50% 50%, #daff00cc, #faf9f6)')
  })
})
