// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getClientSession, getClientReviewPreviewById } = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getClientReviewPreviewById: vi.fn(),
}))
vi.mock('@/lib/portal/auth', () => ({ getClientSession }))
vi.mock('@/lib/portal/review-previews', () => ({ getClientReviewPreviewById }))

import { GET } from './route'

const params = (slug: string, previewId: string) => ({ params: Promise.resolve({ slug, previewId }) })
const request = new Request('https://www.thedotcreative.co/api/client/kanset/review-previews/x')

beforeEach(() => { getClientSession.mockReset(); getClientReviewPreviewById.mockReset() })

describe('client review preview refresh route', () => {
  it('refuses a request with no seat for that client', async () => {
    getClientSession.mockResolvedValue(null)
    const response = await GET(request, params('kanset', 'p1'))
    expect(response.status).toBe(401)
    expect(getClientReviewPreviewById).not.toHaveBeenCalled()
  })

  it('reads with the session client id, never one from the URL', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c-from-session' })
    getClientReviewPreviewById.mockResolvedValue({ id: 'p1', videoUrl: 'https://signed/x' })
    const response = await GET(request, params('kanset', 'p1'))
    expect(getClientReviewPreviewById).toHaveBeenCalledWith('c-from-session', 'p1')
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ preview: { id: 'p1', videoUrl: 'https://signed/x' } })
  })

  it('answers 404 when RLS hides the preview', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c1' })
    getClientReviewPreviewById.mockResolvedValue(null)
    expect((await GET(request, params('kanset', 'p1'))).status).toBe(404)
  })

  it('does not leak an internal error message', async () => {
    getClientSession.mockResolvedValue({ clientId: 'c1' })
    getClientReviewPreviewById.mockRejectedValue(new Error('Could not sign review preview: secret detail'))
    const response = await GET(request, params('kanset', 'p1'))
    expect(response.status).toBe(500)
    expect(JSON.stringify(await response.json())).not.toContain('secret detail')
  })
})
