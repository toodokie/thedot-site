// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { runPreviewRetention, createSupabaseAdmin } = vi.hoisted(() => ({
  runPreviewRetention: vi.fn(),
  createSupabaseAdmin: vi.fn(() => ({ admin: true })),
}))
vi.mock('@/lib/portal/review-preview-retention', () => ({ runPreviewRetention }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin }))

import { GET } from './route'

const call = (authorization?: string) => GET(new Request('https://www.thedotcreative.co/api/cron/portal-preview-retention', {
  headers: authorization ? { authorization } : {},
}))

beforeEach(() => { vi.stubEnv('CRON_SECRET', 'cron-secret-value'); runPreviewRetention.mockReset() })
afterEach(() => { vi.unstubAllEnvs() })

describe('preview retention cron', () => {
  it('refuses a call without the cron secret', async () => {
    expect((await call()).status).toBe(401)
    expect((await call('Bearer wrong')).status).toBe(401)
    expect(runPreviewRetention).not.toHaveBeenCalled()
  })

  it('runs the sweep across every client and reports the counts', async () => {
    runPreviewRetention.mockResolvedValue({ retired: 2, removed: 2, failed: 0 })
    const response = await call('Bearer cron-secret-value')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ retired: 2, removed: 2, failed: 0 })
    expect(runPreviewRetention).toHaveBeenCalledWith({ admin: true }, { now: expect.any(Date) })
  })

  it('reports a failure as 500 so Vercel shows the cron as failed', async () => {
    runPreviewRetention.mockRejectedValue(new Error('agency_retire_review_previews: boom'))
    expect((await call('Bearer cron-secret-value')).status).toBe(500)
  })
})
