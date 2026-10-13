import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { safeNext } from './redirect'

// A piece link copied out of the portal and sent to Maria used to sign her in and then drop her on
// the workspace landing, which read as the link going somewhere else. safeNext and the two routes
// that consume it were always right; the destination simply was never set anywhere upstream. This
// pins every hop of that chain, because the failure is invisible in types and in every unit test:
// each piece works on its own and the link still lands in the wrong place.
// resolve() from cwd, NOT new URL(path, import.meta.url): Vite statically rewrites the latter
// into an asset import and tries to bundle every file the template could match.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('the destination survives the whole sign-in chain', () => {
  it('middleware puts the wanted page on the login redirect', () => {
    const middleware = read('src/middleware.ts')
    expect(middleware).toContain("loginUrl.searchParams.set('next'")
    expect(middleware).toMatch(/pathname !== '\/client'/)
  })

  it('the login page reads it, validates it, and hands it to the form', () => {
    const page = read('src/app/client/login/page.tsx')
    expect(page).toContain('safeNext')
    expect(page).toContain('next={next}')
  })

  it('the form sends it with the email', () => {
    expect(read('src/app/client/login/LoginForm.tsx')).toContain('JSON.stringify({ email, next })')
  })

  it('the emailed link carries it instead of a hardcoded landing', () => {
    const route = read('src/app/api/client/auth/request-link/route.ts')
    expect(route).toContain('safeNext')
    expect(route, 'the link must not hardcode the workspace landing')
      .not.toContain('&next=/client/kanset')
  })

  it('a dead link keeps it, so the retry still lands on the piece', () => {
    for (const path of [
      'src/app/client/auth/confirm/verify/route.ts',
      'src/app/client/auth/callback/route.ts',
    ]) {
      expect(read(path), path).toContain("retry.searchParams.set('next'")
    }
  })
})

describe('and cannot be turned into an open redirect', () => {
  const origin = 'https://www.thedotcreative.co'
  const landing = '/client/kanset'

  it('keeps a real portal path', () => {
    expect(safeNext('/client/kanset/piece/kanset-2026-09-podcast-ep3-article', origin).pathname)
      .toBe('/client/kanset/piece/kanset-2026-09-podcast-ep3-article')
  })

  it.each([
    ['//evil.com', 'protocol-relative'],
    ['/\\evil.com', 'backslash'],
    ['https://evil.com/client/kanset', 'absolute off-origin'],
    ['/admin/portal', 'outside the client tree'],
    ['', 'empty'],
  ])('falls back to the landing for %s (%s)', (raw) => {
    expect(safeNext(raw, origin).pathname).toBe(landing)
  })
})
