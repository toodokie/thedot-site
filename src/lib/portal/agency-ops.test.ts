// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), results: new Map<string, unknown>() }))
function chain(table: string) {
  const query: Record<string, unknown> = {}
  for (const name of ['select', 'eq', 'in', 'order']) query[name] = () => query
  query.limit = () => Promise.resolve(mocks.results.get(table))
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.results.get(table)).then(resolve)
  return query
}
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ rpc: mocks.rpc, from: (table: string) => chain(table) }),
}))

import {
  getLatestFeedback, getOpenClientSignals, getPieceRequestContext, getReleaseMediaAlerts, resolveClientSignal,
} from './agency-ops'

beforeEach(() => { mocks.rpc.mockReset(); mocks.results.clear() })

describe('agency ops readers', () => {
  it('maps open signal rows and drops unknown types', async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { event_id: 'e1', seq: 2, client_id: 'c', event_type: 'portal_feedback_submitted', created_at: 't',
        actor_name: 'Maria Guerts', content_item_id: null, content_key: null, title: null, payload: { rating: 5 } },
      { event_id: 'e2', seq: 1, client_id: 'c', event_type: 'unknown', created_at: 't',
        actor_name: 'x', content_item_id: null, content_key: null, title: null, payload: {} },
    ], error: null })
    const signals = await getOpenClientSignals()
    expect(mocks.rpc).toHaveBeenCalledWith('agency_open_client_signals', { p_limit: 100 })
    expect(signals.map((signal) => signal.id)).toEqual(['e1'])
  })

  it('surfaces a signal read failure instead of an empty, reassuring list', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getOpenClientSignals()).rejects.toThrow(/boom/)
  })

  it('resolves through the audited RPC with the admin actor', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'resolved' }, error: null })
    await resolveClientSignal({ eventId: 'e1', note: null, idempotencyKey: 'k1' })
    expect(mocks.rpc).toHaveBeenCalledWith('agency_resolve_inbox_event', {
      p_event_id: 'e1', p_note: null, p_actor_key: 'thedot-admin', p_idempotency_key: 'k1',
    })
  })

  it('reads the latest feedback answers', async () => {
    mocks.results.set('portal_feedback_responses', { data: [
      { seat_name: 'Maria Guerts', rating: 4, comment: 'Much easier.', created_at: '2026-10-03T10:00:00Z', prompt_key: 'p' },
    ], error: null })
    expect(await getLatestFeedback('c')).toEqual([
      { seatName: 'Maria Guerts', rating: 4, comment: 'Much easier.', createdAt: '2026-10-03T10:00:00Z', promptKey: 'p' },
    ])
  })

  it('loads bundles, sent anchors and versions for one piece', async () => {
    mocks.results.set('content_edit_review_bundles', { data: [{ id: 'b1', request_ids: ['r1'] }], error: null })
    mocks.results.set('content_review_drafts', { data: [{ sent_bundle_id: 'b1', target_kind: 'asset',
      target_key: 'reel-video', anchor: 'frame:2', anchor_label: null }], error: null })
    mocks.results.set('content_item_versions', { data: [{ version: 1, synced_at: '2026-09-25T00:00:00Z' }], error: null })
    const context = await getPieceRequestContext('c', 'item')
    expect(context.bundles).toHaveLength(1)
    expect(context.sentDrafts[0].anchor).toBe('frame:2')
    expect(context.versions[0].version).toBe(1)
  })
})

describe('release media alerts (amended 2026-10-03)', () => {
  it('reads the live list through the agency RPC', async () => {
    const row = { client_id: 'c', content_item_id: 'i', content_key: 'k', title: 'T', content_version: 2,
      planned_date: null, waiting_on: 'review', override_reason: null }
    mocks.rpc.mockResolvedValue({ data: [row], error: null })
    expect(await getReleaseMediaAlerts()).toEqual([row])
    expect(mocks.rpc).toHaveBeenCalledWith('agency_release_media_alerts')
  })

  it('surfaces a read failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getReleaseMediaAlerts()).rejects.toThrow(/boom/)
  })
})
