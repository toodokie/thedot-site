import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert }) }),
}))

import { recordRefusal } from './refusal-log'

const base = { clientId: 'c1', reason: 'write_failed' as const, clientMessage: 'Could not send.' }

describe('recording a refused edit', () => {
  beforeEach(() => { insert.mockReset(); insert.mockResolvedValue({ error: null }) })

  it('keeps one row per block, grouped as a single attempt', async () => {
    await recordRefusal({
      ...base,
      drafts: [
        { targetKind: 'copy_block', targetKey: 'article-body', targetLabel: 'Article', proposedText: 'her words' },
        { targetKind: 'copy_block', targetKey: 'social-caption', targetLabel: 'Caption', proposedText: 'more words' },
      ],
    })
    const rows = insert.mock.calls[0][0]
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r: { attempt_id: string }) => r.attempt_id)).size).toBe(1)
    expect(rows.map((r: { proposed_text: string }) => r.proposed_text)).toEqual(['her words', 'more words'])
  })

  it('still records the attempt when there is no draft to keep', async () => {
    await recordRefusal({ ...base, reason: 'expired_review' })
    expect(insert.mock.calls[0][0]).toHaveLength(1)
    expect(insert.mock.calls[0][0][0].proposed_text).toBeNull()
  })

  it('records the TRUE length even when the stored text is capped', async () => {
    // Otherwise an over-long attempt would be indistinguishable from one that just fit, which is
    // the fact most worth knowing about a refusal.
    const huge = 'x'.repeat(250000)
    await recordRefusal({ ...base, drafts: [{ targetKey: 'body', proposedText: huge }] })
    const row = insert.mock.calls[0][0][0]
    expect(row.proposed_length).toBe(250000)
    expect(row.proposed_text).toHaveLength(200000)
  })

  it('never throws, whatever the database does', async () => {
    // Logging a refusal must not turn into a second failure on top of the one being logged.
    insert.mockResolvedValue({ error: { message: 'boom' } })
    await expect(recordRefusal({ ...base })).resolves.toBeUndefined()
    insert.mockRejectedValue(new Error('connection lost'))
    await expect(recordRefusal({ ...base })).resolves.toBeUndefined()
  })
})
