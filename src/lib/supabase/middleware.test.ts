import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createServerClient, getClaims, getUser } = vi.hoisted(() => ({
  createServerClient: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({ createServerClient }))

import { refreshPortalSession } from './middleware'

function request() {
  return {
    headers: new Headers(),
    cookies: { getAll: vi.fn(() => []), set: vi.fn() },
  } as unknown as NextRequest
}

describe('refreshPortalSession', () => {
  beforeEach(() => {
    createServerClient.mockReset()
    getClaims.mockReset()
    getUser.mockReset()
    createServerClient.mockReturnValue({ auth: { getClaims, getUser } })
  })

  it('validates the session with verified JWT claims instead of a remote user lookup', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-user' } }, error: null })

    const result = await refreshPortalSession(request())

    expect(result.userId).toBe('verified-user')
    expect(getClaims).toHaveBeenCalledOnce()
    expect(getUser).not.toHaveBeenCalled()
  })

  it('treats a missing verified subject as logged out', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const result = await refreshPortalSession(request())

    expect(result.userId).toBeNull()
    expect(result.error).toBeNull()
  })
})
