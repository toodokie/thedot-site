// @vitest-environment node

import { SignJWT } from 'jose'
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it } from 'vitest'
import { hasValidAdminMiddlewareSession } from './admin-middleware-auth'

const previousSecret = process.env.ADMIN_JWT_SECRET

function requestWithSession(token?: string) {
  return new NextRequest('https://www.thedotcreative.co/admin/portal', {
    headers: token ? { cookie: `session=${token}` } : undefined,
  })
}

afterEach(() => {
  if (previousSecret === undefined) delete process.env.ADMIN_JWT_SECRET
  else process.env.ADMIN_JWT_SECRET = previousSecret
})

describe('hasValidAdminMiddlewareSession', () => {
  it('accepts only a correctly scoped, unexpired admin token', async () => {
    process.env.ADMIN_JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const token = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('admin')
      .setIssuer('thedot-site')
      .setAudience('thedot-admin')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.ADMIN_JWT_SECRET))

    await expect(hasValidAdminMiddlewareSession(requestWithSession(token))).resolves.toBe(true)
    await expect(hasValidAdminMiddlewareSession(requestWithSession('invalid'))).resolves.toBe(false)
    await expect(hasValidAdminMiddlewareSession(requestWithSession())).resolves.toBe(false)
  })
})
