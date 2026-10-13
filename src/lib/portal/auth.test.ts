import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createSupabaseServer, getClaims, getUser, rpc } = vi.hoisted(() => ({
  createSupabaseServer: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer }))

describe('getClientSession', () => {
  beforeEach(() => {
    vi.resetModules()
    createSupabaseServer.mockReset()
    getClaims.mockReset()
    getUser.mockReset()
    rpc.mockReset()
    createSupabaseServer.mockResolvedValue({ auth: { getClaims, getUser }, rpc })
  })

  it('uses the tenant-scoped membership RPC without repeating the middleware auth lookup', async () => {
    rpc.mockResolvedValue({
      data: [{
        user_id: 'verified-user',
        email: 'maria@kanset.com',
        name: 'Maria Guerts',
        role: 'client',
        client_id: 'client-id',
        client_slug: 'kanset',
        can_decide: true,
        can_comment: true,
        can_submit_requests: true,
        can_manage_schedule: true,
        can_use_assistant: true,
      }],
      error: null,
    })

    const { getClientSession } = await import('./auth')
    const result = await getClientSession('kanset')

    expect(result?.userId).toBe('verified-user')
    expect(getClaims).not.toHaveBeenCalled()
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('portal_client_session', { p_slug: 'kanset' })
  })

  it('returns null when the authenticated membership RPC returns no row', async () => {
    rpc.mockResolvedValue({ data: [], error: null })

    const { getClientSession } = await import('./auth')

    await expect(getClientSession('kanset')).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('returns null when an unauthenticated caller cannot execute the membership RPC', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function portal_client_session' },
    })

    const { getClientSession } = await import('./auth')

    await expect(getClientSession('kanset')).resolves.toBeNull()
  })

  it('fails closed when the membership RPC errors', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'membership unavailable' } })

    const { getClientSession, PortalAuthError } = await import('./auth')

    await expect(getClientSession('kanset')).rejects.toBeInstanceOf(PortalAuthError)
  })
})
