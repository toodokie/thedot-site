// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(), assertSameOriginRequest: vi.fn(), resolveClientSignal: vi.fn(),
}))
vi.mock('@/lib/admin-security', () => ({
  requireAdminSession: mocks.requireAdminSession, assertSameOriginRequest: mocks.assertSameOriginRequest,
}))
vi.mock('@/lib/portal/agency-ops', () => ({ resolveClientSignal: mocks.resolveClientSignal }))

import { POST } from './route'

const EVENT = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const KEY = '6fa459ea-ee8a-4ca4-894e-db77e160355e'
const post = (body: unknown) => POST(new Request('https://www.thedotcreative.co/api/admin/portal/inbox-resolve', {
  method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://www.thedotcreative.co' },
}))

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.requireAdminSession.mockResolvedValue({ role: 'admin' })
  mocks.resolveClientSignal.mockResolvedValue({ outcome: 'resolved' })
})

describe('POST /api/admin/portal/inbox-resolve', () => {
  it('resolves one signal', async () => {
    const response = await post({ eventId: EVENT, idempotencyKey: KEY })
    expect(response.status).toBe(200)
    expect(mocks.resolveClientSignal).toHaveBeenCalledWith({ eventId: EVENT, note: null, idempotencyKey: KEY })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('refuses a malformed body', async () => {
    expect((await post({ eventId: 'nope', idempotencyKey: KEY })).status).toBe(400)
    expect((await post({ eventId: EVENT, idempotencyKey: KEY, note: 'x'.repeat(1001) })).status).toBe(400)
    expect(mocks.resolveClientSignal).not.toHaveBeenCalled()
  })

  it('refuses without an admin session or from another origin', async () => {
    mocks.requireAdminSession.mockRejectedValueOnce(new Error('ADMIN_AUTH_REQUIRED'))
    expect((await post({ eventId: EVENT, idempotencyKey: KEY })).status).toBe(401)
    mocks.assertSameOriginRequest.mockImplementationOnce(() => { throw new Error('INVALID_ORIGIN') })
    expect((await post({ eventId: EVENT, idempotencyKey: KEY })).status).toBe(403)
    expect(mocks.resolveClientSignal).not.toHaveBeenCalled()
  })

  it('never echoes a database error to the caller', async () => {
    mocks.resolveClientSignal.mockRejectedValueOnce(new Error('relation agency_inbox_resolutions secret detail'))
    const response = await post({ eventId: EVENT, idempotencyKey: KEY })
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('agency_inbox_resolutions')
  })
})
