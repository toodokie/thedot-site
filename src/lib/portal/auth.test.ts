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

  it('uses verified JWT claims and the tenant-scoped membership RPC', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-user' } }, error: null })
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
    expect(getClaims).toHaveBeenCalledOnce()
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).toHaveBeenCalledWith('portal_client_session', { p_slug: 'kanset' })
  })

  it('returns null when there is no verified session', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const { getClientSession } = await import('./auth')

    await expect(getClientSession('kanset')).resolves.toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('fails closed when the verified subject and membership differ', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'verified-user' } }, error: null })
    rpc.mockResolvedValue({
      data: [{
        user_id: 'different-user',
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

    const { getClientSession, PortalAuthError } = await import('./auth')

    await expect(getClientSession('kanset')).rejects.toBeInstanceOf(PortalAuthError)
  })
})
