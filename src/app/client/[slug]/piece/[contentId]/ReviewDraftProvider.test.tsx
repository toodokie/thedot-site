import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReviewDraftProvider, { useReviewDrafts } from './ReviewDraftProvider'
import { editDraftKey } from '@/lib/portal/edit-drafts'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'

const actions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(),
  discardReviewDraft: vi.fn(),
  sendReviewDrafts: vi.fn(),
  reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => actions)
vi.mock('../../request-actions', () => ({ sendReviewBundle: vi.fn() }))

const SERVER_ID = '11111111-1111-4111-8111-111111111111'
const caption = { kind: 'copy_block' as const, key: 'caption', label: 'Caption', currentText: 'Old caption' }
const KEY = (version: number, key = 'caption', kind = 'copy_block', anchor = '') =>
  editDraftKey('maria', 'kanset', 'piece', version, kind, key, anchor)

let api: ReturnType<typeof useReviewDrafts>
function Probe() {
  api = useReviewDrafts()
  return <output data-testid="status">{api.statusText ?? ''}</output>
}

function row(overrides: Partial<ServerDraftRow> = {}): ServerDraftRow {
  return {
    id: SERVER_ID, content_item_id: 'item-1', base_version: 2, target_kind: 'copy_block', target_key: 'caption',
    anchor: '', anchor_label: null, target_label: 'Caption', url_snapshot: null, quoted_text: null,
    body: 'Server text', status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
    carried_over_at: null, carried_over_to_version: null, send_failed_at: null, last_send_error: null,
    ...overrides,
  }
}

function mount(serverRows: ServerDraftRow[] = []) {
  return render(<ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={2}
    serverSync initialServerDrafts={serverRows}><Probe /></ReviewDraftProvider>)
}

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => value })
}

// Decision 6 as approved: "this phone" on a touch device, "this device" on a desktop.
function setMobile(value: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true,
    value: (query: string) => ({ matches: value && query.includes('coarse'), media: query,
      addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }) })
}

function blockedStorage() {
  const fail = () => { throw new DOMException('Blocked', 'SecurityError') }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return fail() }, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail,
  } })
}

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    get length() { return values.size }, clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key) },
    setItem: (key: string, value: string) => { values.set(key, value) },
  } })
  setOnline(true)
  setMobile(false)
  for (const fn of Object.values(actions)) fn.mockReset()
  actions.saveReviewDraft.mockImplementation(async (input: {
    body: string; savedAt: string; baseVersion: number; targetKey: string
  }) => ({ outcome: 'saved', draft: row({ id: '22222222-2222-4222-8222-222222222222', body: input.body,
    saved_at: input.savedAt, base_version: input.baseVersion, target_key: input.targetKey }) }))
  actions.discardReviewDraft.mockResolvedValue({ outcome: 'discarded' })
  actions.reportReviewSendFailure.mockResolvedValue({ recorded: true, retryable: false })
})
afterEach(() => { vi.useRealTimers() })

describe('restoring drafts on any device', () => {
  it('shows the newer server draft over an older copy on this phone', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Old phone text', savedAt: '2026-10-03T09:00:00.000Z' }))
    mount([row()])
    expect(api.ready).toBe(true)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Server text'])
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Server text')
  })

  it('pushes a newer copy from this phone to the server', async () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Typed offline', savedAt: '2026-10-03T11:00:00.000Z' }))
    mount([row()])
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', baseVersion: 2, targetKey: 'caption', body: 'Typed offline',
      savedAt: '2026-10-03T11:00:00.000Z',
    }))
    expect(api.drafts[0].proposedText).toBe('Typed offline')
  })

  it('drops a copy on this phone that another device already sent', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Sent elsewhere', savedAt: '2026-10-03T09:00:00.000Z' }))
    mount([row({ status: 'sent' })])
    expect(api.drafts).toEqual([])
    expect(window.localStorage.getItem(KEY(2))).toBeNull()
  })

  it('never drops a copy the server has never seen, even a legacy one', () => {
    window.localStorage.setItem(KEY(2), JSON.stringify({ proposedText: 'Only on this phone' }))
    mount([])
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Only on this phone'])
  })
})

describe('autosave', () => {
  it('saves a few seconds after typing stops and then says it is not sent yet', async () => {
    vi.useFakeTimers()
    mount()
    act(() => api.saveDraft(caption, 'New caption'))
    expect(screen.getByTestId('status')).toHaveTextContent('Saving…')
    expect(actions.saveReviewDraft).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    // Wait for the save the timer started to finish before reading the status.
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('Saved · not sent yet')
  })

  it('keeps the draft on this phone while offline and syncs when the connection returns', async () => {
    setOnline(false)
    setMobile(true)
    mount()
    act(() => api.saveDraft(caption, 'Typed on the train'))
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).not.toHaveBeenCalled()
    expect(screen.getByTestId('status')).toHaveTextContent('Saved on this phone · will sync when online')
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Typed on the train')
    setOnline(true)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1))
  })

  it('says "this device" on a desktop while offline', async () => {
    setOnline(false)
    mount()
    act(() => api.saveDraft(caption, 'Typed on a laptop'))
    await act(async () => { await api.flush() })
    expect(screen.getByTestId('status')).toHaveTextContent('Saved on this device · will sync when online')
  })

  it('keeps the draft and shows the offline line when the server save fails', async () => {
    actions.saveReviewDraft.mockResolvedValue({ error: 'Could not save your edit to the portal.', retryable: true })
    mount()
    act(() => api.saveDraft(caption, 'Server is down'))
    let ok: boolean | undefined
    await act(async () => { ok = await api.flush() })
    expect(ok).toBe(false)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Server is down'])
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Server is down')
    expect(screen.getByTestId('status')).toHaveTextContent('Saved on this device · will sync when online')
    actions.saveReviewDraft.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await act(async () => { ok = await api.flush() })
    expect(ok).toBe(false)
    expect(api.drafts).toHaveLength(1)
  })

  it('saves straight away when the page is hidden or left, without waiting for the timer', async () => {
    vi.useFakeTimers()
    mount()
    act(() => api.saveDraft(caption, 'Switching apps'))
    await act(async () => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    act(() => api.saveDraft(caption, 'Closing the tab'))
    await act(async () => { window.dispatchEvent(new Event('pagehide')) })
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(2)
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Closing the tab' }))
  })

  it('adopts newer text another device saved instead of overwriting it', async () => {
    actions.saveReviewDraft.mockResolvedValue({ outcome: 'stale',
      draft: row({ body: 'Desktop text', saved_at: '2099-01-01T00:00:00.000Z' }) })
    mount()
    act(() => api.saveDraft(caption, 'Phone text'))
    await act(async () => { await api.flush() })
    expect(api.drafts[0].proposedText).toBe('Desktop text')
  })

  it('keeps frame notes on one visual apart', () => {
    mount()
    const reel = { kind: 'asset' as const, key: 'reel', label: 'Reel', urlSnapshot: 'https://www.canva.com/design/R/view' }
    act(() => {
      api.saveDraft({ ...reel, anchor: 'frame:3', anchorLabel: 'Frame 3' }, 'Fix the typo')
      api.saveDraft(reel, 'Use the closed-mouth cover')
    })
    expect(api.drafts).toHaveLength(2)
    expect(window.localStorage.getItem(KEY(2, 'reel', 'asset', 'frame:3'))).not.toBeNull()
    expect(window.localStorage.getItem(KEY(2, 'reel', 'asset'))).not.toBeNull()
  })
})

describe('discarding', () => {
  it('discards only when asked and tells the server which text it was', async () => {
    mount([row()])
    act(() => api.removeDraft(caption))
    await act(async () => { await api.flush() })
    expect(actions.discardReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetKind: 'copy_block', targetKey: 'caption', anchor: '', reason: 'client_discarded',
      savedAt: '2026-10-03T10:00:00.000Z',
    }))
    expect(api.drafts).toEqual([])
  })

  it('records going back to the original text as reverted', async () => {
    mount([row()])
    act(() => api.saveDraft(caption, 'Old caption'))
    await act(async () => { await api.flush() })
    expect(actions.discardReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ reason: 'reverted' }))
  })
})

describe('carry-over', () => {
  it('shows a draft from the previous version and rebases it when kept', async () => {
    mount([row({ base_version: 1, carried_over_at: '2026-10-03T10:05:00.000Z', carried_over_to_version: 2 })])
    expect(api.carriedDrafts).toHaveLength(1)
    expect(api.carriedDrafts[0].carriedFromVersion).toBe(1)
    expect(api.currentDrafts).toHaveLength(0)
    act(() => api.keepCarriedDraft(api.carriedDrafts[0]))
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ baseVersion: 2, body: 'Server text' }))
    expect(api.carriedDrafts).toHaveLength(0)
    expect(api.currentDrafts).toHaveLength(1)
  })
})

describe('sending', () => {
  it('sends saved drafts by id and clears them only after the server accepts', async () => {
    actions.sendReviewDrafts.mockResolvedValue({ success: 'Your edit was sent to The Dot.', requestIds: ['r1'], sentDraftIds: [SERVER_ID] })
    mount([row()])
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await api.send('Thanks') })
    expect(actions.sendReviewDrafts).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [SERVER_ID], note: 'Thanks',
    }))
    expect(outcome).toEqual({ ok: true, message: 'Your edit was sent to The Dot.' })
    expect(api.drafts).toEqual([])
    expect(window.localStorage.getItem(KEY(2))).toBeNull()
  })

  it('keeps every draft and retries with the same key after a refusal', async () => {
    actions.sendReviewDrafts
      .mockResolvedValueOnce({ error: 'Your edits could not be sent. They are still saved, and we have your text.' })
      .mockResolvedValueOnce({ success: 'Your edit was sent to The Dot.' })
    mount([row()])
    let first: { ok: boolean; message: string } | undefined
    await act(async () => { first = await api.send('') })
    expect(first?.ok).toBe(false)
    expect(api.drafts).toHaveLength(1)
    expect(screen.getByTestId('status')).toHaveTextContent("Couldn't send. Retry")
    await act(async () => { await api.send('') })
    const keys = actions.sendReviewDrafts.mock.calls.map(([input]) => input.idempotencyKey)
    expect(keys[0]).toBe(keys[1])
    expect(api.drafts).toEqual([])
    // The server action already recorded the refusal; the browser does not report it twice.
    expect(actions.reportReviewSendFailure).not.toHaveBeenCalled()
  })

  it('records a send that never reached the server and keeps the drafts', async () => {
    actions.sendReviewDrafts.mockRejectedValue(new TypeError('Failed to fetch'))
    mount([row()])
    await act(async () => { await api.send('') })
    expect(api.drafts).toHaveLength(1)
    await waitFor(() => expect(actions.reportReviewSendFailure).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'kanset', contentId: 'piece', contentVersion: 2, draftIds: [SERVER_ID],
      drafts: [expect.objectContaining({ proposedText: 'Server text' })],
    })))
  })

  it('retries the failure report on the save retry schedule until it is written down', async () => {
    vi.useFakeTimers()
    actions.sendReviewDrafts.mockRejectedValue(new TypeError('Failed to fetch'))
    actions.reportReviewSendFailure
      .mockResolvedValueOnce({ recorded: false, retryable: true })
      .mockResolvedValueOnce({ recorded: true, retryable: false })
    mount([row()])
    await act(async () => { await api.send('') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(2)
  })

  it('does not retry a failure report the server says it will never accept', async () => {
    vi.useFakeTimers()
    actions.sendReviewDrafts.mockRejectedValue(new TypeError('Failed to fetch'))
    actions.reportReviewSendFailure.mockResolvedValue({ recorded: false, retryable: false })
    mount([row()])
    await act(async () => { await api.send('') })
    await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(1)
  })

  it('does not send while a draft has not reached the server', async () => {
    setOnline(false)
    mount()
    act(() => api.saveDraft(caption, 'Offline edit'))
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await api.send('') })
    expect(actions.sendReviewDrafts).not.toHaveBeenCalled()
    expect(outcome?.ok).toBe(false)
    expect(api.drafts).toHaveLength(1)
  })
})

describe('when the browser blocks storage', () => {
  it('keeps typing in memory and still autosaves to the server', async () => {
    blockedStorage()
    mount([row({ target_key: 'title', id: '33333333-3333-4333-8333-333333333333' })])
    expect(api.ready).toBe(true)
    expect(api.storageAvailable).toBe(false)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Server text'])
    act(() => api.saveDraft(caption, 'Private window text'))
    expect(api.readDraft(caption)?.proposedText).toBe('Private window text')
    await act(async () => { await api.flush() })
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({
      targetKey: 'caption', body: 'Private window text',
    }))
    expect(screen.getByTestId('status')).toHaveTextContent('Saved · not sent yet')
    act(() => api.removeDraft(caption))
    await act(async () => { await api.flush() })
    expect(actions.discardReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ targetKey: 'caption' }))
    expect(api.drafts).toHaveLength(1)
  })

  it('works when window.localStorage itself throws on access', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true,
      get: () => { throw new DOMException('Blocked', 'SecurityError') } })
    mount()
    act(() => api.saveDraft(caption, 'No storage at all'))
    await act(async () => { await api.flush() })
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['No storage at all'])
    expect(actions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ body: 'No storage at all' }))
  })
})
