import { describe, expect, it, vi } from 'vitest'
import { fakeAdmin } from '../fake-admin.test-helper'

const state = vi.hoisted(() => ({ admin: null as unknown }))
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.admin }))
vi.mock('@/lib/portal/data', async (original) => ({
  ...(await original<typeof import('@/lib/portal/data')>()),
  mapContentRow: (row: { id: string }) => ({ id: row.id, version: 1 }),
}))
vi.mock('@/lib/portal/piece-page/seat-requests', () => ({ seatRequestIdsFrom: async () => [] }))

import { loadClientPiecePreview } from './preview-data'

describe('loadClientPiecePreview for a client other than Kanset', () => {
  it('loads that client\'s deciding seat instead of failing on Maria\'s', async () => {
    state.admin = fakeAdmin({
      clients: [{ id: 'c-acme', slug: 'acme' }],
      content_with_state: [{ id: 'item-a', client_id: 'c-acme', content_id: 'a-piece' }],
    }, {
      list_portal_access: [
        { client_id: 'c-kanset', email: 'maria@kanset.com', name: 'Maria', can_decide: true },
        { client_id: 'c-acme', email: 'boss@acme.test', name: 'Boss', auth_user_id: 'u-boss', can_decide: true },
      ],
    })
    const preview = await loadClientPiecePreview('acme', 'a-piece')
    expect(preview?.slug).toBe('acme')
    expect(preview?.seatName).toBe('Boss')
    expect(preview?.seatUserId).toBe('u-boss')
  })
})
