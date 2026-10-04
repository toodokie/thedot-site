import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getClientSession: vi.fn(), getContentItem: vi.fn() }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))

import { resolvePieceMetadata } from './piece-metadata'

const SESSION = { clientId: 'client-uuid', userId: 'user-uuid' }
const GENERIC = 'Kanset · Client Portal'

beforeEach(() => {
  mocks.getClientSession.mockReset()
  mocks.getContentItem.mockReset()
})

describe('piece page metadata', () => {
  it('titles the page with the client and piece for a viewer who can see it', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: 'What it costs to hire a foreign worker' })
    const meta = await resolvePieceMetadata('kanset', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(mocks.getContentItem).toHaveBeenCalledWith('client-uuid', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(meta.title).toBe('Kanset · What it costs to hire a foreign worker')
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(meta.openGraph).toMatchObject({ title: 'Kanset · What it costs to hire a foreign worker' })
    expect(meta.twitter).toMatchObject({ title: 'Kanset · What it costs to hire a foreign worker' })
  })

  it('gives a logged-out or non-member viewer the generic title and never queries the piece', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    const meta = await resolvePieceMetadata('kanset', 'kanset-2026-10-foreign-worker-cost-reel')
    expect(meta.title).toBe(GENERIC)
    expect(meta.robots).toEqual({ index: false, follow: false })
    expect(mocks.getContentItem).not.toHaveBeenCalled()
  })

  it('gives the generic title when RLS hides the piece', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue(null)
    const meta = await resolvePieceMetadata('kanset', 'someone-elses-piece')
    expect(meta.title).toBe(GENERIC)
    expect(JSON.stringify(meta)).not.toContain('someone-elses-piece')
  })

  it('gives the generic title for a blank piece title', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: '   ' })
    expect((await resolvePieceMetadata('kanset', 'x-piece')).title).toBe(GENERIC)
  })

  it('never throws from metadata, so an outage cannot leak an error string into the head', async () => {
    mocks.getClientSession.mockRejectedValue(new Error('auth outage detail'))
    const meta = await resolvePieceMetadata('kanset', 'x-piece')
    expect(meta.title).toBe(GENERIC)
    expect(JSON.stringify(meta)).not.toContain('outage')
  })

  it('trims the piece title', async () => {
    mocks.getClientSession.mockResolvedValue(SESSION)
    mocks.getContentItem.mockResolvedValue({ title: '  Two clocks  ' })
    expect((await resolvePieceMetadata('kanset', 'x-piece')).title).toBe('Kanset · Two clocks')
  })
})
