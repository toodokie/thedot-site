// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => ({ rpc }) }))

import { GET } from './route'

const call = (token?: string) => GET(new Request('https://www.thedotcreative.co/api/cron/portal-unsent-draft-alerts', {
  headers: token ? { authorization: `Bearer ${token}` } : {},
}))

beforeEach(() => {
  rpc.mockReset()
  vi.stubEnv('CRON_SECRET', 'cron-secret-for-tests')
})

describe('GET /api/cron/portal-unsent-draft-alerts', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('wrong')).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('refuses every call when CRON_SECRET is not set', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await call('')).status).toBe(401)
    expect((await call('anything')).status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('raises alert events and reports how many were new', async () => {
    rpc.mockResolvedValue({ data: 2, error: null })
    const response = await call('cron-secret-for-tests')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ raised: 2 })
    expect(rpc).toHaveBeenCalledWith('agency_raise_unsent_draft_alert_events', { p_now: null })
  })

  it('fails loudly with a generic body when the database refuses', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom secret detail' } })
    const response = await call('cron-secret-for-tests')
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret detail')
  })
})
