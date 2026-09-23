import { NextRequest, NextResponse } from 'next/server'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/auth-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { refreshPortalSession } = vi.hoisted(() => ({ refreshPortalSession: vi.fn() }))

vi.mock('@/lib/supabase/middleware', () => ({ refreshPortalSession }))
vi.mock('./lib/security-stats', () => ({ incrementBotBlocks: vi.fn() }))

import { middleware } from './middleware'

function request(pathname: string) {
  return new NextRequest(`https://www.thedotcreative.co${pathname}`, {
    headers: {
      host: 'www.thedotcreative.co',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-proto': 'https',
    },
  })
}

describe('admin route guarding', () => {
  // Regression, 2026-09-21. /admin/dashboard was outside the guard and publicly
  // cacheable: it returned 200 with x-vercel-cache HIT and no cookie. That exposed
  // the page and disguised a failed sign-in as a login loop, because the dashboard
  // rendered while /admin/portal correctly rejected the same request.
  it('sends a logged-out admin dashboard request to the login page', async () => {
    const response = await middleware(request('/admin/dashboard'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/admin/login')
  })

  it('still guards the admin portal', async () => {
    const response = await middleware(request('/admin/portal/pieces'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/admin/login')
  })

  it('leaves the admin login page reachable, or nobody can sign in', async () => {
    const response = await middleware(request('/admin/login'))
    expect(response.status).not.toBe(307)
  })

  it('never lets an admin response be shared-cacheable', async () => {
    const response = await middleware(request('/admin/login'))
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('cache-control')).not.toContain('public')
  })
})

describe('portal middleware auth routing', () => {
  beforeEach(() => {
    refreshPortalSession.mockReset()
    refreshPortalSession.mockResolvedValue({ response: NextResponse.next(), userId: null, error: null })
  })

  it('redirects logged-out protected portal requests before rendering a 404 fallback', async () => {
    const response = await middleware(request('/client/kanset/piece/example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe('https://www.thedotcreative.co/client/login')
  })

  // A piece link shared with the client used to sign her in and then land her on the workspace
  // instead of the piece, because the login redirect threw the destination away here.
  it('carries the page she was trying to open into the login redirect', async () => {
    const response = await middleware(request('/client/kanset/piece/example'))
    const location = new URL(response.headers.get('location') ?? '')

    expect(location.searchParams.get('next')).toBe('/client/kanset/piece/example')
  })

  it('does not add a destination for the portal landing itself', async () => {
    const response = await middleware(request('/client'))
    const location = new URL(response.headers.get('location') ?? '')

    expect(location.searchParams.get('next')).toBeNull()
  })

  it('keeps the login route public', async () => {
    const response = await middleware(request('/client/login'))

    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('/client/login')
    expect(refreshPortalSession).not.toHaveBeenCalled()
  })

  it('passes a protected portal request after claims verification succeeds', async () => {
    refreshPortalSession.mockResolvedValue({
      response: NextResponse.next(),
      userId: 'verified-user',
      error: null,
    })

    const response = await middleware(request('/client/kanset'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('fails closed quickly when the portal auth provider is unavailable', async () => {
    refreshPortalSession.mockResolvedValue({
      response: NextResponse.next(),
      userId: null,
      error: new AuthRetryableFetchError('request timed out', 0),
    })

    const response = await middleware(request('/client/kanset'))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(response.headers.get('retry-after')).toBe('5')
    expect(await response.text()).toContain('temporarily unavailable')
  })

  it('fails closed when the auth provider rate-limits a session refresh', async () => {
    refreshPortalSession.mockResolvedValue({
      response: NextResponse.next(),
      userId: null,
      error: new AuthApiError('too many requests', 429),
    })

    const response = await middleware(request('/client/kanset'))

    expect(response.status).toBe(503)
    expect(response.headers.get('retry-after')).toBe('5')
  })

  it('fails closed when session refresh throws unexpectedly', async () => {
    refreshPortalSession.mockRejectedValue(new Error('provider connection failed'))

    const response = await middleware(request('/client/kanset'))

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('redirects logged-out Agency Ops requests before rendering a 404 fallback', async () => {
    const response = await middleware(request('/admin/portal'))

    expect(response.status).toBe(307)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const location = new URL(response.headers.get('location') ?? '')
    expect(location.origin + location.pathname).toBe('https://www.thedotcreative.co/admin/login')
  })

  // An operator bounced out of Ops used to land on a bare password box and be dropped on the
  // dashboard afterwards, so a session that had merely run out read as a broken page.
  it('carries the Ops page you were trying to open back to the login form', async () => {
    const response = await middleware(request('/admin/portal/ideas'))
    const location = new URL(response.headers.get('location') ?? '')

    expect(location.searchParams.get('next')).toBe('/admin/portal/ideas')
  })
})
