import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const not = vi.fn()
  const query: Record<string, unknown> = {}
  Object.assign(query, {
    select: vi.fn(() => query), eq: vi.fn(() => query), order: vi.fn(() => query),
    not: vi.fn((column: string, op: string, value: string) => { not(column, op, value); return query }),
    limit: vi.fn(async () => ({ data: [], error: null })),
  })
  return { not, query }
})
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServer: async () => ({ from: () => mocks.query }) }))

import { getActivity } from './data'

describe('her activity feed', () => {
  it('keeps her feedback answer out (decision 6) and keeps every earlier exclusion', async () => {
    await getActivity('client-1')
    const [, op, value] = mocks.not.mock.calls[0]
    expect(op).toBe('in')
    const excluded = value.replace(/^\(|\)$/g, '').split(',')
    for (const event of ['design_link_updated', 'working_version_discarded', 'agency_supersession_recorded',
      'agency_draft_archived', 'review_preview_uploaded', 'review_preview_deleted', 'release_media_override',
      'review_drafts_carried_over', 'review_send_failed', 'review_send_retry_succeeded', 'review_playback_failed',
      'portal_feedback_submitted']) {
      expect(excluded).toContain(event)
    }
  })
})
