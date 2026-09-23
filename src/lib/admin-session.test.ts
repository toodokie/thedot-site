/**
 * @vitest-environment node
 *
 * jsdom gives TextEncoder a Uint8Array from another realm, which jose rejects with
 * "payload must be an instance of Uint8Array". This module is pure Node anyway.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { checkAdminMiddlewareSession } from './admin-middleware-auth'

const SECRET = 'a'.repeat(48)
process.env.ADMIN_JWT_SECRET = SECRET

async function token(opts: { issuedSecondsAgo: number; lifetimeSeconds: number }) {
  const iat = Math.floor(Date.now() / 1000) - opts.issuedSecondsAgo
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('admin').setIssuer('thedot-site').setAudience('thedot-admin')
    .setIssuedAt(iat).setExpirationTime(iat + opts.lifetimeSeconds)
    .sign(new TextEncoder().encode(SECRET))
}

const withCookie = (value?: string) => new NextRequest('https://www.thedotcreative.co/admin/portal/ideas', {
  headers: { host: 'www.thedotcreative.co', 'user-agent': 'Mozilla/5.0', ...(value ? { cookie: `session=${value}` } : {}) },
})

const HOUR = 3600

describe('the admin session tells us WHICH way it failed', () => {
  it('names an expired session rather than calling it absent', async () => {
    // The difference is the whole fix: "your session ran out" can be shown on screen, and an
    // operator reading that does not report Ops as broken.
    const check = await checkAdminMiddlewareSession(withCookie(await token({ issuedSecondsAgo: 13 * HOUR, lifetimeSeconds: 12 * HOUR })))
    expect(check.state).toBe('expired')
  })

  it('reports no cookie as absent', async () => {
    expect((await checkAdminMiddlewareSession(withCookie())).state).toBe('absent')
  })

  it('reports a tampered token as invalid, never as valid', async () => {
    const good = await token({ issuedSecondsAgo: 60, lifetimeSeconds: 12 * HOUR })
    expect((await checkAdminMiddlewareSession(withCookie(`${good}x`))).state).toBe('invalid')
  })
})

describe('an operator who is working is not thrown out', () => {
  it('refreshes a session past halfway through its life', async () => {
    const check = await checkAdminMiddlewareSession(withCookie(await token({ issuedSecondsAgo: 7 * HOUR, lifetimeSeconds: 12 * HOUR })))
    expect(check).toMatchObject({ state: 'valid', shouldRefresh: true })
  })

  it('leaves a fresh session alone', async () => {
    const check = await checkAdminMiddlewareSession(withCookie(await token({ issuedSecondsAgo: 60, lifetimeSeconds: 12 * HOUR })))
    expect(check).toMatchObject({ state: 'valid', shouldRefresh: false })
  })
})

describe('the session cookie survives arriving from another site', () => {
  // SameSite=Strict withholds the cookie on a top-level navigation that comes from anywhere else,
  // so opening an Ops link from outside the site bounced to login with a perfectly good session,
  // and a reload silently "fixed" it. That is indistinguishable from one page being broken.
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

  it.each(['src/lib/auth.ts', 'src/middleware.ts'])('%s sets the admin cookie Lax, not Strict', (path) => {
    const source = read(path)
    expect(source).toContain("sameSite: 'lax'")
    expect(source, 'Strict drops the cookie on cross-site navigation').not.toContain("sameSite: 'strict'")
  })

  it('still sets httpOnly and a path', () => {
    for (const path of ['src/lib/auth.ts', 'src/middleware.ts']) {
      expect(read(path)).toContain('httpOnly: true')
      expect(read(path)).toContain("path: '/'")
    }
  })
})
