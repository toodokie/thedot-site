import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getClientSession: vi.fn(),
  getContentItem: vi.fn(),
  rpc: vi.fn(),
  draftRows: vi.fn(),
  recordRefusal: vi.fn(),
  revalidatePath: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
vi.mock('next/navigation', () => ({ redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT') }) }))
vi.mock('@/lib/portal/auth', () => ({ getClientSession: mocks.getClientSession }))
vi.mock('@/lib/portal/data', () => ({ getContentItem: mocks.getContentItem }))
vi.mock('@/lib/portal/refusal-log', () => ({ recordRefusal: mocks.recordRefusal }))
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServer: async () => ({
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ in: mocks.draftRows }) }),
  }),
}))

import { discardReviewDraft, reportReviewSendFailure, saveReviewDraft, sendReviewDrafts } from './draft-actions'

const SESSION = {
  userId: 'user-1', email: 'maria@kanset.com', name: 'Maria Guerts', clientId: 'client-1', clientSlug: 'kanset',
  role: 'client', canDecide: true, canComment: true, canSubmitRequests: true, canManageSchedule: true, canUseAssistant: false,
}
const DRAFT_A = '11111111-1111-4111-8111-111111111111'
const DRAFT_B = '22222222-2222-4222-8222-222222222222'
const KEY = '33333333-3333-4333-8333-333333333333'
const SAVE = {
  slug: 'kanset', contentId: 'piece', baseVersion: 2, targetKind: 'copy_block' as const, targetKey: 'caption',
  anchor: '', anchorLabel: null, targetLabel: 'Caption', urlSnapshot: null, quotedText: null,
  body: 'Maria rewrote it.', savedAt: '2026-10-03T10:00:00.000Z',
}
const SEND = { slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [DRAFT_A, DRAFT_B], note: '', idempotencyKey: KEY }

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.getClientSession.mockResolvedValue(SESSION)
  mocks.getContentItem.mockResolvedValue({ id: 'item-1', content_id: 'piece', version: 2 })
  mocks.draftRows.mockResolvedValue({ data: [
    { target_kind: 'copy_block', target_key: 'caption', target_label: 'Caption', anchor_label: null, body: 'Her caption' },
    { target_kind: 'asset', target_key: 'reel', target_label: 'Reel', anchor_label: 'Frame 3', body: 'Her frame note' },
  ], error: null })
})

describe('saveReviewDraft', () => {
  it('saves through the seat session', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'saved', draft: { id: DRAFT_A } }, error: null })
    const result = await saveReviewDraft(SAVE)
    expect(mocks.rpc).toHaveBeenCalledWith('save_review_draft', {
      p_content_id: 'item-1', p_base_version: 2, p_target_kind: 'copy_block', p_target_key: 'caption',
      p_anchor: '', p_anchor_label: null, p_target_label: 'Caption', p_url_snapshot: null,
      p_quoted_text: null, p_body: 'Maria rewrote it.', p_saved_at: '2026-10-03T10:00:00.000Z',
    })
    expect(result).toEqual({ outcome: 'saved', draft: { id: DRAFT_A } })
  })

  it('tells the browser to keep its copy and stop retrying when the version moved', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'review_draft_stale_version' } })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
  })

  it('asks the browser to retry an unexplained failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: true })
  })

  it('does not redirect or write when the session has ended', async () => {
    mocks.getClientSession.mockResolvedValue(null)
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('takes the client and seat from the session, never from the input', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'saved', draft: { id: DRAFT_A } }, error: null })
    await saveReviewDraft({ ...SAVE, clientId: 'forged-client', clientSlug: 'other', userId: 'forged-user',
      auth_user_id: 'forged-user', p_client_id: 'forged-client' } as never)
    expect(mocks.getContentItem).toHaveBeenCalledWith('client-1', 'piece')
    const args = mocks.rpc.mock.calls[0][1]
    expect(JSON.stringify(args)).not.toMatch(/forged/)
    expect(Object.keys(args).sort()).toEqual(['p_anchor', 'p_anchor_label', 'p_base_version', 'p_body',
      'p_content_id', 'p_quoted_text', 'p_saved_at', 'p_target_key', 'p_target_kind', 'p_target_label',
      'p_url_snapshot'])
  })

  it('refuses a seat that cannot submit edits without calling the database', async () => {
    mocks.getClientSession.mockResolvedValue({ ...SESSION, canSubmitRequests: false })
    expect(await saveReviewDraft(SAVE)).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('discardReviewDraft', () => {
  it('passes the reason and the time of the text being discarded', async () => {
    mocks.rpc.mockResolvedValue({ data: { outcome: 'discarded' }, error: null })
    await discardReviewDraft({ slug: 'kanset', contentId: 'piece', targetKind: 'asset', targetKey: 'reel',
      anchor: 'frame:3', reason: 'client_discarded', savedAt: SAVE.savedAt })
    expect(mocks.rpc).toHaveBeenCalledWith('discard_review_draft', {
      p_content_id: 'item-1', p_target_kind: 'asset', p_target_key: 'reel', p_anchor: 'frame:3',
      p_reason: 'client_discarded', p_saved_at: SAVE.savedAt,
    })
  })

  it('refuses an unknown reason before reaching the database', async () => {
    const result = await discardReviewDraft({ slug: 'kanset', contentId: 'piece', targetKind: 'copy_block',
      targetKey: 'caption', anchor: '', reason: 'because' as never, savedAt: SAVE.savedAt })
    expect(result).toMatchObject({ retryable: false })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

describe('sendReviewDrafts', () => {
  it('sends the saved drafts by id and revalidates the piece', async () => {
    mocks.rpc.mockResolvedValue({ data: { bundle_id: 'b1', request_ids: ['r1', 'r2'], outcome: 'created',
      sent_draft_ids: [DRAFT_A, DRAFT_B] }, error: null })
    const result = await sendReviewDrafts({ ...SEND, note: ' Thanks ' })
    expect(mocks.rpc).toHaveBeenCalledWith('send_review_drafts', {
      p_content_id: 'item-1', p_content_version: 2, p_draft_ids: [DRAFT_A, DRAFT_B], p_note: 'Thanks',
      p_idempotency_key: KEY,
    })
    expect(result).toEqual({ success: 'Your 2 edits were sent to The Dot.', requestIds: ['r1', 'r2'],
      sentDraftIds: [DRAFT_A, DRAFT_B] })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/client/kanset/piece/piece')
    expect(mocks.recordRefusal).not.toHaveBeenCalled()
  })

  it('logs her words with the draft ids when drafts changed on another device', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'drafts_changed' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/another device/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'drafts_changed', clientId: 'client-1', contentItemId: 'item-1', draftIds: [DRAFT_A, DRAFT_B],
      drafts: [
        { targetKind: 'copy_block', targetKey: 'caption', targetLabel: 'Caption', proposedText: 'Her caption' },
        { targetKind: 'asset', targetKey: 'reel', targetLabel: 'Reel · Frame 3', proposedText: 'Her frame note' },
      ],
    }))
  })

  it('asks her to keep or discard carried drafts first', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'drafts_carried_over' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/previous version/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'version_stale' }))
  })

  it('treats a reused send key with different drafts as a refused send, never success', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'idempotency key reused with different request' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.success).toBeUndefined()
    expect(result.sentDraftIds).toBeUndefined()
    expect(result.error).toMatch(/changed while/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'drafts_changed', draftIds: [DRAFT_A, DRAFT_B] }))
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('says her text is kept on an unexplained failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toBe('Your edits could not be sent. They are still saved, and we have your text.')
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'write_failed' }))
  })

  it('refuses an empty or duplicated draft list and still logs the attempt', async () => {
    await sendReviewDrafts({ ...SEND, draftIds: [] })
    await sendReviewDrafts({ ...SEND, draftIds: [DRAFT_A, DRAFT_A] })
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.recordRefusal).toHaveBeenCalledTimes(2)
    expect(mocks.recordRefusal.mock.calls.every(([record]) => record.reason === 'empty_bundle')).toBe(true)
  })

  it('never assumes every draft was sent when the database does not say which were', async () => {
    mocks.rpc.mockResolvedValue({ data: { bundle_id: 'b1', request_ids: ['r1'], outcome: 'created' }, error: null })
    const missing = await sendReviewDrafts(SEND)
    expect(missing.success).toBeUndefined()
    expect(missing.error).toMatch(/could not confirm/)
    mocks.rpc.mockResolvedValue({ data: { bundle_id: 'b1', request_ids: ['r1'], outcome: 'created',
      sent_draft_ids: [DRAFT_A] }, error: null })
    const partial = await sendReviewDrafts(SEND)
    expect(partial.success).toBeUndefined()
    expect(mocks.recordRefusal).toHaveBeenCalledTimes(2)
    expect(mocks.recordRefusal.mock.calls.every(([record]) => record.reason === 'write_failed')).toBe(true)
  })

  it('logs refusals against the session seat and client, ignoring forged input', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await sendReviewDrafts({ ...SEND, clientId: 'forged-client', userId: 'forged-user' } as never)
    expect(mocks.getContentItem).toHaveBeenCalledWith('client-1', 'piece')
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', requestedBy: 'user-1', requesterName: 'Maria Guerts' }))
    expect(JSON.stringify(mocks.rpc.mock.calls[0][1])).not.toMatch(/forged/)
  })

  it('refuses a page that is behind the released version', async () => {
    mocks.getContentItem.mockResolvedValue({ id: 'item-1', content_id: 'piece', version: 3 })
    const result = await sendReviewDrafts(SEND)
    expect(result.error).toMatch(/newer version/)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({ reason: 'version_stale' }))
  })
})

describe('reportReviewSendFailure', () => {
  it('records a send that never reached the server, with her text', async () => {
    mocks.recordRefusal.mockResolvedValue({ recorded: true })
    expect(await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [DRAFT_A, 'nope'],
      drafts: [{ targetKind: 'copy_block', targetKey: 'caption', targetLabel: 'Caption', proposedText: 'Typed on the train' }] }))
      .toEqual({ recorded: true, retryable: false })
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'network_unreachable', clientMessage: "Couldn't send. Retry", contentItemId: 'item-1',
      draftIds: [DRAFT_A], drafts: [expect.objectContaining({ proposedText: 'Typed on the train' })],
    }))
    expect(mocks.getContentItem).toHaveBeenCalledWith('client-1', 'piece')
  })

  it('tells the browser to retry when the failure could not be written down', async () => {
    mocks.recordRefusal.mockResolvedValue({ recorded: false })
    expect(await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [],
      drafts: [] })).toEqual({ recorded: false, retryable: true })
  })

  it('records it against the session client and seat, ignoring forged input', async () => {
    mocks.recordRefusal.mockResolvedValue({ recorded: true })
    await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [], drafts: [],
      clientId: 'forged-client', requestedBy: 'forged-user' } as never)
    expect(mocks.recordRefusal).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1', requestedBy: 'user-1' }))
  })

  it('records nothing for a seat that cannot submit edits', async () => {
    mocks.getClientSession.mockResolvedValue({ ...SESSION, canSubmitRequests: false })
    expect(await reportReviewSendFailure({ slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [],
      drafts: [] })).toEqual({ recorded: false, retryable: false })
    expect(mocks.recordRefusal).not.toHaveBeenCalled()
  })
})
