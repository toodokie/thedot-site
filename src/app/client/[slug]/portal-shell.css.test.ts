import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/app/client/[slug]/portal-shell.module.css'), 'utf8')

describe('portal shell and the new piece page', () => {
  it('publishes the sidebar width for fixed bars', () => {
    expect(css).toMatch(/\.shell\s*\{[^}]*--portal-sidebar-w:\s*0px/)
    expect(css).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.shell\s*\{[^}]*--portal-sidebar-w:\s*216px/)
  })

  it('lets the new piece page use the full content width', () => {
    expect(css).toMatch(/\.main:has\(\[data-piece-page-v2\]\)\s*\{[^}]*padding:\s*0[^}]*max-width:\s*none/)
  })

  it('hides the bottom navigation on a phone only while the new piece page is open', () => {
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.shell:has\(\[data-piece-page-v2\]\) \.nav\s*\{\s*display:\s*none;/)
  })
})

// Every current page (Maria's live seat) renders inside this shell: the change must not touch it.
describe('portal shell for every other page', () => {
  it('keeps the current main padding on a phone and on desktop', () => {
    expect(css).toMatch(/\n\.main\s*\{\s*padding:\s*24px 20px 92px;/)
    expect(css).toMatch(/\n {2}\.main\s*\{\s*padding:\s*40px 48px;\s*max-width:\s*1120px;\s*\}/)
  })

  it('keeps the bottom navigation fixed and visible on a phone', () => {
    expect(css).toMatch(/\n\.nav\s*\{\s*position:\s*fixed;/)
    expect(css).not.toMatch(/\n\.nav\s*\{[^}]*display:\s*none/)
  })

  it('scopes every new-page rule to the new page marker', () => {
    const unscopedHides = css.match(/[^\n{}]*\{[^}]*(display:\s*none|max-width:\s*none)[^}]*\}/g) ?? []
    const offenders = unscopedHides.filter((rule) => /\.nav|\.main/.test(rule.split('{')[0]) && !rule.includes('data-piece-page-v2'))
    expect(offenders).toEqual([])
  })
})
