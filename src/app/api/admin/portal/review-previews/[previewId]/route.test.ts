// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requireAdminSession, getAgencyReviewPreviewById } = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getAgencyReviewPreviewById: vi.fn(),
}))
vi.mock('@/lib/admin-security', () => ({ requireAdminSession }))
vi.mock('@/lib/portal/review-previews', () => ({ getAgencyReviewPreviewById }))

import { GET } from './route'

const params = (previewId: string) => ({ params: Promise.resolve({ previewId }) })
const request = new Request('https://www.thedotcreative.co/api/admin/portal/review-previews/p1')

beforeEach(() => { requireAdminSession.mockReset(); getAgencyReviewPreviewById.mockReset() })

describe('admin review preview refresh route', () => {
  it('refuses without an admin session', async () => {
    requireAdminSession.mockRejectedValue(new Error('ADMIN_AUTH_REQUIRED'))
    const response = await GET(request, params('p1'))
    expect(response.status).toBe(401)
    expect(getAgencyReviewPreviewById).not.toHaveBeenCalled()
  })

  it('returns fresh signed links for the agency', async () => {
    requireAdminSession.mockResolvedValue({ role: 'admin' })
    getAgencyReviewPreviewById.mockResolvedValue({ id: 'p1' })
    const response = await GET(request, params('p1'))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('answers 404 for an unknown preview', async () => {
    requireAdminSession.mockResolvedValue({ role: 'admin' })
    getAgencyReviewPreviewById.mockResolvedValue(null)
    expect((await GET(request, params('p1'))).status).toBe(404)
  })
})
