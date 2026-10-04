import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The read-only "View as Maria" preview (?layout=v2) renders the new piece page inside this
// shell, so its fixed header and decision bar need the same frame rules as the client shell.
const css = readFileSync(resolve(process.cwd(), 'src/app/admin/portal/admin-shell.module.css'), 'utf8')

describe('admin shell and the new piece page preview', () => {
  it('publishes the sidebar width for fixed bars', () => {
    expect(css).toMatch(/\.shell\s*\{[^}]*--portal-sidebar-w:\s*0px/)
    expect(css).toMatch(/@media \(min-width: 768px\)\s*\{\s*\.shell\s*\{[^}]*--portal-sidebar-w:\s*216px/)
  })

  it('lets the new piece page use the full content width', () => {
    expect(css).toMatch(/\.main:has\(\[data-piece-page-v2\]\)\s*\{[^}]*padding:\s*0[^}]*max-width:\s*none/)
  })

  it('hides the bottom navigation on a phone only while the new piece page is open', () => {
    expect(css).toMatch(/@media \(max-width: 767px\)\s*\{\s*\.shell:has\(\[data-piece-page-v2\]\) \.nav\s*\{\s*display:\s*none;/)
    expect(css).not.toMatch(/\n\.nav\s*\{[^}]*display:\s*none/)
  })
})
