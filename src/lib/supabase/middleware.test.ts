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

  it('keeps the proven bounded user lookup at the routing boundary', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'verified-user' } }, error: null })

    const result = await refreshPortalSession(request())

    expect(result.userId).toBe('verified-user')
    expect(getUser).toHaveBeenCalledOnce()
    expect(getClaims).not.toHaveBeenCalled()
  })

  it('treats a missing user as logged out', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })

    const result = await refreshPortalSession(request())

    expect(result.userId).toBeNull()
    expect(result.error).toBeNull()
  })
})
