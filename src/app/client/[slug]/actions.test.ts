import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getContentItem: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT ${path}`) }),
}))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ rpc: mocks.rpc }) }))

import { decide } from './actions'

function form() {
  const data = new FormData()
  data.set('slug', 'kanset')
  data.set('contentId', 'piece')
  data.set('decision', 'approved')
  return data
}

beforeEach(() => {
  mocks.getClientSession.mockResolvedValue({ clientId: 'c1', canDecide: true })
  mocks.getContentItem.mockResolvedValue({ id: 'i1', version: 2, status: 'draft', canva_url: 'https://www.canva.com/x', drive_url: null })
  mocks.rpc.mockReset()
})

describe('decide', () => {
  it('explains an approval refused because edits are still unsent', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'unsent_review_drafts' } })
    expect(await decide(form())).toEqual({
      error: 'You have edits that are not sent yet. Send them or discard them, then approve.',
    })
  })

  it('keeps the generic message for any other refusal', async () => {
    mocks.rpc.mockResolvedValue({ error: { message: 'unresolved client edit request' } })
    expect(await decide(form())).toEqual({ error: 'Could not save your decision. Please try again.' })
  })
})
