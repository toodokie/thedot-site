import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), rpc: vi.fn(async () => ({ data: null, error: null })) }))
vi.mock('next/navigation', () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`) }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { acknowledgePiecePageIntro } from './request-actions'
import { PIECE_PAGE_INTRO_KEY } from '@/lib/portal/review-flow-announcement'

beforeEach(() => { mocks.rpc.mockClear(); mocks.getClientSession.mockResolvedValue({ clientId: 'c1' }) })

describe('acknowledgePiecePageIntro', () => {
  it('records the per-seat acknowledgment under the new key', async () => {
    expect(PIECE_PAGE_INTRO_KEY).toBe('piece_page_2026_10')
    await acknowledgePiecePageIntro('kanset')
    expect(mocks.rpc).toHaveBeenCalledWith('acknowledge_portal_announcement', {
      p_client_id: 'c1', p_announcement_key: 'piece_page_2026_10',
    })
  })

  it('sends a signed-out visitor to the login page', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    await expect(acknowledgePiecePageIntro('kanset')).rejects.toThrow('REDIRECT /client/login')
  })
})
