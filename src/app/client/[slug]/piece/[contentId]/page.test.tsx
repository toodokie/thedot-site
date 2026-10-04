import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page switch (plan 4a decision 2): with PORTAL_PIECE_PAGE_V2 off for the seat, the page
// renders today's PieceReviewScreen with today's data and loads nothing new.
const mocks = vi.hoisted(() => {
  const ackEq = vi.fn()
  const ackQuery = {
    select: vi.fn(() => ackQuery),
    eq: vi.fn((column: string, value: unknown) => { ackEq(column, value); return ackQuery }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }
  return {
    ackEq,
    ackQuery,
    getClientSession: vi.fn(),
    getPieceItem: vi.fn(),
    getComments: vi.fn(async () => [{ id: 'comment' }]),
    getScheduleDetails: vi.fn(async () => ({ targets: [], requests: [] })),
    getPublicationDetails: vi.fn(async () => []),
    getContentRequests: vi.fn(async () => [{ id: 'request-1' }]),
    getContentRequestMessages: vi.fn(async () => [{ id: 'message' }]),
    getReviewAssets: vi.fn(async () => [{ id: 'asset' }]),
    getMyReviewDrafts: vi.fn(async () => [{ id: 'draft' }]),
    getClientReviewPreviews: vi.fn(async () => [{ id: 'preview' }]),
    getMyReviewTicks: vi.fn(async () => ['caption']),
  }
})

vi.mock('next/navigation', () => ({ redirect: vi.fn((to: string) => { throw new Error(`redirect ${to}`) }) }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/comments', () => ({ getComments: mocks.getComments }))
vi.mock('@/lib/portal/schedule', () => ({ getScheduleDetails: mocks.getScheduleDetails }))
vi.mock('@/lib/portal/publication', () => ({ getPublicationDetails: mocks.getPublicationDetails }))
vi.mock('@/lib/portal/requests', () => ({
  getContentRequests: mocks.getContentRequests, getContentRequestMessages: mocks.getContentRequestMessages,
}))
vi.mock('@/lib/portal/review-assets', () => ({ getReviewAssets: mocks.getReviewAssets }))
vi.mock('@/lib/portal/review-drafts', () => ({ getMyReviewDrafts: mocks.getMyReviewDrafts }))
vi.mock('@/lib/portal/review-previews', () => ({ getClientReviewPreviews: mocks.getClientReviewPreviews }))
vi.mock('@/lib/portal/piece-page/review-ticks', () => ({ getMyReviewTicks: mocks.getMyReviewTicks }))
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: vi.fn(async () => ({ from: vi.fn(() => mocks.ackQuery) })) }))
vi.mock('./piece-metadata', () => ({ getPieceItem: mocks.getPieceItem, resolvePieceMetadata: vi.fn() }))
vi.mock('./PieceReviewScreen', () => ({ default: function PieceReviewScreen() { return null } }))
vi.mock('./v2/PiecePageV2', () => ({ default: function PiecePageV2() { return null } }))

import { REVIEW_FLOW_ANNOUNCEMENT_KEY, PIECE_PAGE_INTRO_KEY } from '@/lib/portal/review-flow-announcement'
import PieceReviewScreen from './PieceReviewScreen'
import PiecePageV2 from './v2/PiecePageV2'
import Piece from './page'

const session = {
  clientId: 'client-1', userId: 'user-1', email: 'maria@kanset.com',
  canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true,
}
const item = { id: 'item-1', content_id: 'kanset-reel', version: 2 }

function render() {
  return Piece({ params: Promise.resolve({ slug: 'kanset', contentId: 'kanset-reel' }) }) as Promise<{
    type: unknown; props: Record<string, unknown>
  }>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  mocks.getClientSession.mockResolvedValue(session)
  mocks.getPieceItem.mockResolvedValue(item)
})

describe('piece page switch', () => {
  it.each([undefined, '', 'off', 'toodokie@gmail.com'])('renders today\'s page with today\'s data when the switch is %s for the seat', async (setting) => {
    if (setting !== undefined) vi.stubEnv('PORTAL_PIECE_PAGE_V2', setting)
    else vi.stubEnv('PORTAL_PIECE_PAGE_V2', undefined as unknown as string)
    const element = await render()
    expect(element.type).toBe(PieceReviewScreen)
    expect(element.props).toEqual({
      slug: 'kanset',
      item,
      comments: [{ id: 'comment' }],
      schedule: { targets: [], requests: [] },
      publication: [],
      requests: [{ id: 'request-1' }],
      requestMessages: [{ id: 'message' }],
      reviewAssets: [{ id: 'asset' }],
      capabilities: session,
      draftScope: 'user-1',
      showReviewIntro: true,
      serverDrafts: [{ id: 'draft' }],
      backHref: '/client/kanset',
    })
    expect(mocks.ackEq).toHaveBeenCalledWith('announcement_key', REVIEW_FLOW_ANNOUNCEMENT_KEY)
    expect(mocks.getClientReviewPreviews).not.toHaveBeenCalled()
    expect(mocks.getMyReviewTicks).not.toHaveBeenCalled()
  })

  it('renders the new page for a seat on the switch, with previews and ticks from the seat session', async () => {
    vi.stubEnv('PORTAL_PIECE_PAGE_V2', 'Maria@Kanset.com')
    const element = await render()
    expect(element.type).toBe(PiecePageV2)
    expect(element.props).toMatchObject({
      mode: 'client', previews: [{ id: 'preview' }], ticks: ['caption'], serverDrafts: [{ id: 'draft' }],
      draftScope: 'user-1', showIntro: true, previewRefreshBase: '/api/client/kanset/review-previews',
    })
    expect(mocks.ackEq).toHaveBeenCalledWith('announcement_key', PIECE_PAGE_INTRO_KEY)
    expect(mocks.getClientReviewPreviews).toHaveBeenCalledWith('client-1', 'item-1', 2)
    expect(mocks.getMyReviewTicks).toHaveBeenCalledWith('item-1', 2)
  })

  it('keeps the new page up when the previews cannot be read', async () => {
    vi.stubEnv('PORTAL_PIECE_PAGE_V2', 'all')
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.getClientReviewPreviews.mockRejectedValueOnce(new Error('down'))
    const element = await render()
    expect(element.type).toBe(PiecePageV2)
    expect(element.props.previews).toEqual([])
  })
})
