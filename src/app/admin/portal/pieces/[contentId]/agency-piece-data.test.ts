import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdmin } from './fake-admin.test-helper'

const state = vi.hoisted(() => ({ admin: null as unknown }))
const stagePiece = vi.hoisted(() => vi.fn())
const preview = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdmin: () => state.admin }))
vi.mock('@/lib/portal/gates-loader', () => ({ loadAgencyStagePiece: stagePiece }))
vi.mock('@/lib/portal/gates', () => ({
  deriveContentStage: () => ({ stage: 'with_dot', label: 'With The Dot' }),
  resolveNineGates: () => [],
}))
vi.mock('@/lib/portal/agency-ops-core', () => ({
  gateDots: () => [], gateSummary: () => '', mariaViewLine: () => 'Not shared yet', versionRows: () => [],
}))
vi.mock('@/lib/portal/agency-ops', () => ({
  getLatestFeedback: async () => [],
  getPieceRequestContext: async () => ({ bundles: [], drafts: [], versions: [] }),
}))
vi.mock('@/lib/portal/review-drafts', () => ({ getAgencyReviewDrafts: async () => [] }))
vi.mock('@/lib/portal/review-previews', () => ({ getAgencyReviewPreviews: async () => [] }))
vi.mock('@/app/client/[slug]/piece/[contentId]/v2/derive', () => ({ deriveWorkspaceData: () => ({ tabs: [] }) }))
vi.mock('@/lib/portal/piece-page/piece-page-switch', () => ({ usesPiecePageV2: () => false }))
vi.mock('./maria-preview/preview-data', () => ({ PREVIEW_SEAT_EMAIL: 'maria@kanset.com', loadClientPiecePreview: preview }))
vi.mock('../../data', () => ({ loadAdminComments: async () => [], loadRequests: async () => [] }))
vi.mock('../../GatesAdmin', () => ({ stageDisplay: (_stage: string, label: string) => ({ label, detail: null }) }))

import { loadAgencyPieceData } from './agency-piece-data'

const item = (id: string, clientId: string, contentId: string) => ({
  id, client_id: clientId, content_id: contentId, working_version: 1, client_visible_version: null, planned_date: null,
})

beforeEach(() => {
  stagePiece.mockReset()
  preview.mockReset()
  stagePiece.mockImplementation(async (_admin: unknown, clientId: string, contentId: string) =>
    ({ clientId, contentId, title: contentId, released: contentId === 'a-released' }))
  preview.mockResolvedValue(null)
  state.admin = fakeAdmin({
    clients: [{ id: 'c-kanset', slug: 'kanset', name: 'Kanset' }, { id: 'c-acme', slug: 'acme', name: 'Acme' }],
    content_items: [
      item('item-k', 'c-kanset', 'k-piece'), item('item-a', 'c-acme', 'a-piece'), item('item-r', 'c-acme', 'a-released'),
      item('item-sk', 'c-kanset', 'shared'), item('item-sa', 'c-acme', 'shared'),
    ],
  })
})

describe('loadAgencyPieceData across clients', () => {
  it('loads a piece of a client other than Kanset, scoped to that client', async () => {
    const data = await loadAgencyPieceData('a-piece')
    expect(data && 'piece' in data && data.clientSlug).toBe('acme')
    expect(stagePiece).toHaveBeenCalledWith(expect.anything(), 'c-acme', 'a-piece')
  })

  it('still loads a Kanset piece', async () => {
    const data = await loadAgencyPieceData('k-piece')
    expect(data && 'piece' in data && data.clientSlug).toBe('kanset')
    expect(stagePiece).toHaveBeenCalledWith(expect.anything(), 'c-kanset', 'k-piece')
  })

  it('loads the client preview under the piece\'s own client', async () => {
    await loadAgencyPieceData('a-released')
    expect(preview).toHaveBeenCalledWith('acme', 'a-released')
  })

  it('asks which client when a content_id is shared, and loads the named one', async () => {
    const ambiguous = await loadAgencyPieceData('shared')
    expect(ambiguous).toEqual({ ambiguous: true, contentId: 'shared',
      clients: [{ slug: 'acme', name: 'Acme' }, { slug: 'kanset', name: 'Kanset' }] })
    expect(stagePiece).not.toHaveBeenCalled()
    const named = await loadAgencyPieceData('shared', 'acme')
    expect(named && 'piece' in named && named.clientSlug).toBe('acme')
  })

  it('is null for an unknown piece', async () => {
    expect(await loadAgencyPieceData('nope')).toBeNull()
  })
})
