import { beforeEach, describe, expect, it, vi } from 'vitest'

const insert = vi.fn()
const rpc = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdmin: () => ({ from: () => ({ insert }), rpc }),
}))

import { recordRefusal } from './refusal-log'

const base = { clientId: 'c1', reason: 'write_failed' as const, clientMessage: 'Could not send.' }

describe('recording a refused edit', () => {
  beforeEach(() => {
    insert.mockReset(); insert.mockResolvedValue({ error: null })
    rpc.mockReset(); rpc.mockResolvedValue({ data: null, error: null })
  })

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
    await expect(recordRefusal({ ...base })).resolves.toEqual({ recorded: false })
    insert.mockRejectedValue(new Error('connection lost'))
    await expect(recordRefusal({ ...base })).resolves.toEqual({ recorded: false })
  })

  it('raises the attempt in Agency Ops with her draft ids (migration 0093)', async () => {
    await recordRefusal({ ...base, draftIds: ['d1', 'd2'], drafts: [{ targetKey: 'caption', proposedText: 'x' }] })
    const attemptId = insert.mock.calls[0][0][0].attempt_id
    expect(rpc).toHaveBeenCalledWith('agency_record_review_send_failure', { p_attempt_id: attemptId, p_draft_ids: ['d1', 'd2'] })
  })

  it('does not raise an event when the failure row itself could not be written', async () => {
    insert.mockResolvedValue({ error: { message: 'boom' } })
    await recordRefusal({ ...base })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('never throws when raising the event fails, and says it was not recorded', async () => {
    rpc.mockRejectedValue(new Error('down'))
    await expect(recordRefusal({ ...base, reason: 'network_unreachable' })).resolves.toEqual({ recorded: false })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(recordRefusal({ ...base, reason: 'network_unreachable' })).resolves.toEqual({ recorded: false })
  })

  it('says the failure was recorded once the row and the Agency Ops event are both written', async () => {
    await expect(recordRefusal({ ...base, draftIds: ['d1'] })).resolves.toEqual({ recorded: true })
  })
})
