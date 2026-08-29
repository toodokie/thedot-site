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

describe('portal middleware auth routing', () => {
  beforeEach(() => {
    refreshPortalSession.mockReset()
    refreshPortalSession.mockResolvedValue({ response: NextResponse.next(), userId: null, error: null })
  })

  it('redirects logged-out protected portal requests before rendering a 404 fallback', async () => {
    const response = await middleware(request('/client/kanset/piece/example'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://www.thedotcreative.co/client/login')
    expect(response.headers.get('cache-control')).toContain('no-store')
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
    expect(response.headers.get('location')).toBe('https://www.thedotcreative.co/admin/login')
    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
