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

  it('saves straight away when the page is hidden, without waiting for the timer', async () => {
    vi.useFakeTimers()
    mount()
    act(() => api.saveDraft(caption, 'Switching apps'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      await vi.advanceTimersByTimeAsync(100)
    })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Switching apps' }))
  })

  it('saves straight away when the page is left, without waiting for the timer', async () => {
    vi.useFakeTimers()
    mount()
    act(() => api.saveDraft(caption, 'Closing the tab'))
    await act(async () => {
      window.dispatchEvent(new Event('pagehide'))
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Closing the tab' }))
  })

  it('retries a failed save after 15 seconds on its own', async () => {
    vi.useFakeTimers()
    actions.saveReviewDraft.mockResolvedValueOnce({ error: 'Could not save.', retryable: true })
    mount()
    act(() => api.saveDraft(caption, 'Try again later'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('status')).toHaveTextContent('Saved on this device · will sync when online')
    await act(async () => { await vi.advanceTimersByTimeAsync(14000) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('status')).toHaveTextContent('Saved · not sent yet')
  })

  it('backs off and stops retrying a save that keeps failing', async () => {
    vi.useFakeTimers()
    actions.saveReviewDraft.mockResolvedValue({ error: 'Could not save.', retryable: true })
    mount()
    act(() => api.saveDraft(caption, 'Dead server'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
    const attempts = actions.saveReviewDraft.mock.calls.length
    expect(attempts).toBeGreaterThan(1)
    expect(attempts).toBeLessThanOrEqual(6)
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000) })
    expect(actions.saveReviewDraft.mock.calls.length).toBe(attempts)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Dead server'])
  })

  it('says plainly when the portal will not take an edit, keeps it here and stops retrying', async () => {
    vi.useFakeTimers()
    actions.saveReviewDraft.mockResolvedValue({ error: 'raw server detail 42P01', retryable: false })
    mount()
    act(() => api.saveDraft(caption, 'Refused text'))
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    const status = screen.getByTestId('status').textContent ?? ''
    expect(status).toBe("Couldn't save this edit to the portal. It is still on this device.")
    expect(status).not.toContain('will sync when online')
    expect(status).not.toContain('42P01')
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('Refused text')
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
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

  it('backs off the failure report like a save, stops after five retries and starts again on reconnect', async () => {
    vi.useFakeTimers()
    actions.sendReviewDrafts.mockRejectedValue(new TypeError('Failed to fetch'))
    actions.reportReviewSendFailure.mockResolvedValue({ recorded: false, retryable: true })
    mount([row()])
    await act(async () => { await api.send('') })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(1)
    // 15 s, then 30, 60, 120, 240: five retries, doubling.
    await act(async () => { await vi.advanceTimersByTimeAsync(14999) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(29999) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(3)
    await act(async () => { await vi.advanceTimersByTimeAsync(60000 + 120000 + 240000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(6)
    await act(async () => { await vi.advanceTimersByTimeAsync(24 * 3600 * 1000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(6)
    // The connection coming back starts a fresh schedule.
    await act(async () => { window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(0) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(7)
    await act(async () => { await vi.advanceTimersByTimeAsync(15000) })
    expect(actions.reportReviewSendFailure).toHaveBeenCalledTimes(8)
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

describe('races that must never lose her text', () => {
  it('keeps newer local text when a stale save answer carries older server text', async () => {
    const answer = deferred<unknown>()
    actions.saveReviewDraft.mockImplementationOnce(() => answer.promise)
    mount()
    act(() => api.saveDraft(caption, 'First'))
    let flushing!: Promise<boolean>
    act(() => { flushing = api.flush() })
    act(() => api.saveDraft(caption, 'Second, typed while saving'))
    const typedAt = api.drafts[0].savedAt
    answer.resolve({ outcome: 'stale', draft: row({ body: 'Older server text',
      saved_at: new Date(Date.parse(typedAt) - 1).toISOString() }) })
    await act(async () => { await flushing; await api.flush() })
    expect(api.drafts[0].proposedText).toBe('Second, typed while saving')
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Second, typed while saving' }))
  })

  it('keeps text typed after a discard when the discard answer is stale with older text', async () => {
    const answer = deferred<unknown>()
    actions.discardReviewDraft.mockImplementationOnce(() => answer.promise)
    mount([row()])
    act(() => api.removeDraft(caption))
    let flushing!: Promise<boolean>
    act(() => { flushing = api.flush() })
    act(() => api.saveDraft(caption, 'Started again'))
    answer.resolve({ outcome: 'stale', draft: row({ body: 'Older server text', saved_at: '2026-10-03T10:30:00.000Z' }) })
    await act(async () => { await flushing; await api.flush() })
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['Started again'])
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'Started again' }))
  })

  it('does not bring back a draft she discarded while its save was in flight', async () => {
    const answer = deferred<unknown>()
    actions.saveReviewDraft.mockImplementationOnce(() => answer.promise)
    mount()
    act(() => api.saveDraft(caption, 'About to discard'))
    let flushing!: Promise<boolean>
    act(() => { flushing = api.flush() })
    act(() => api.removeDraft(caption))
    answer.resolve({ outcome: 'saved', draft: row({ body: 'About to discard' }) })
    await act(async () => { await flushing; await api.flush() })
    expect(api.drafts).toEqual([])
    expect(window.localStorage.getItem(KEY(2))).toBeNull()
    expect(actions.discardReviewDraft).toHaveBeenCalledTimes(1)
  })

  it('keeps text typed while a send was in flight as a new unsent draft', async () => {
    const answer = deferred<unknown>()
    actions.sendReviewDrafts.mockImplementationOnce(() => answer.promise)
    mount([row()])
    let sending!: Promise<{ ok: boolean; message: string }>
    act(() => { sending = api.send('') })
    await waitFor(() => expect(actions.sendReviewDrafts).toHaveBeenCalledTimes(1))
    act(() => api.saveDraft(caption, 'One more thing'))
    answer.resolve({ success: 'Your edit was sent to The Dot.', sentDraftIds: [SERVER_ID] })
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await sending; await api.flush() })
    expect(outcome?.ok).toBe(true)
    expect(api.drafts.map((draft) => draft.proposedText)).toEqual(['One more thing'])
    expect(JSON.parse(window.localStorage.getItem(KEY(2)) ?? '{}').proposedText).toBe('One more thing')
    expect(actions.saveReviewDraft).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'One more thing' }))
  })

  it('only reports a flush done when nothing is in flight, so send never fails falsely', async () => {
    const first = deferred<unknown>()
    const second = deferred<unknown>()
    actions.saveReviewDraft.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
    actions.sendReviewDrafts.mockResolvedValue({ success: 'Your edit was sent to The Dot.' })
    mount()
    act(() => api.saveDraft(caption, 'A'))
    const savedAt = api.drafts[0].savedAt
    let a!: Promise<boolean>
    let b!: Promise<boolean>
    let c!: Promise<boolean>
    act(() => { a = api.flush(); b = api.flush(); c = api.flush() })
    let cDone = false
    void c.then(() => { cDone = true })
    // The first attempt fails and is queued again; one waiting flush starts the retry.
    first.resolve({ error: 'Could not save.', retryable: true })
    await act(async () => { await a; for (let i = 0; i < 10; i += 1) await Promise.resolve() })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(2)
    expect(cDone).toBe(false)
    second.resolve({ outcome: 'saved', draft: row({ id: SERVER_ID, body: 'A', saved_at: savedAt }) })
    await act(async () => { await b; await c })
    let outcome: { ok: boolean; message: string } | undefined
    await act(async () => { outcome = await api.send('') })
    expect(outcome?.ok).toBe(true)
  })

  it('flushes pending saves when the page unmounts and arms no retry afterwards', async () => {
    vi.useFakeTimers()
    actions.saveReviewDraft.mockResolvedValue({ error: 'Could not save.', retryable: true })
    const view = mount()
    act(() => api.saveDraft(caption, 'Leaving now'))
    await act(async () => { view.unmount(); await vi.advanceTimersByTimeAsync(0) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(60 * 60 * 1000) })
    expect(actions.saveReviewDraft).toHaveBeenCalledTimes(1)
  })
})

describe('field scratch', () => {
  it('drops the scratch of a target once its draft is sent', async () => {
    actions.sendReviewDrafts.mockResolvedValue({ success: 'Your edit was sent to The Dot.', requestIds: ['r1'], sentDraftIds: [SERVER_ID] })
    mount([row()])
    act(() => api.saveFieldScratch(caption, 'chapters', '[{"time":"","title":"x"}]'))
    expect(api.readFieldScratch(caption, 'chapters')).not.toBeNull()
    await act(async () => { await api.send('Thanks') })
    expect(api.readFieldScratch(caption, 'chapters')).toBeNull()
    expect(Object.keys({ ...window.localStorage }).some((key) => key.startsWith('portal-edit-scratch:'))).toBe(false)
  })

  it('purges scratch kept for other versions when the page loads', () => {
    const scratchBase = 'portal-edit-scratch:maria:kanset:piece:'
    window.localStorage.setItem(`${scratchBase}v1:copy_block%3Acaption%3A:chapters`, JSON.stringify({ value: 'old', savedAt: '2026-10-01T10:00:00.000Z' }))
    window.localStorage.setItem(`${scratchBase}v2:copy_block%3Acaption%3A:chapters`, JSON.stringify({ value: 'kept', savedAt: '2026-10-01T10:00:00.000Z' }))
    mount()
    expect(window.localStorage.getItem(`${scratchBase}v1:copy_block%3Acaption%3A:chapters`)).toBeNull()
    expect(api.readFieldScratch(caption, 'chapters')).toBe('kept')
  })

  it('prefers a newer draft from another device over older scratch, and newer scratch over an older draft', () => {
    const scratchKey = 'portal-edit-scratch:maria:kanset:piece:v2:copy_block%3Acaption%3A:chapters'
    window.localStorage.setItem(scratchKey, JSON.stringify({ value: 'typed here', savedAt: '2026-10-03T09:00:00.000Z' }))
    const first = mount([row({ saved_at: '2026-10-03T10:00:00.000Z' })])
    expect(api.readFieldScratch(caption, 'chapters')).toBeNull()
    first.unmount()
    window.localStorage.clear()
    window.localStorage.setItem(scratchKey, JSON.stringify({ value: 'typed here', savedAt: '2026-10-03T11:00:00.000Z' }))
    mount([row({ saved_at: '2026-10-03T10:00:00.000Z' })])
    expect(api.readFieldScratch(caption, 'chapters')).toBe('typed here')
  })

  it('keeps scratch as new as her own later saves on this device', () => {
    mount()
    act(() => api.saveFieldScratch(caption, 'chapters', 'typed here'))
    act(() => api.saveDraft(caption, 'New caption', null))
    expect(api.readFieldScratch(caption, 'chapters')).toBe('typed here')
  })
})

describe('field scratch cost', () => {
  it('adds no browser storage scan to her keystrokes', () => {
    mount()
    act(() => api.saveDraft(caption, 'a', null))
    act(() => api.saveFieldScratch(caption, 'chapters', 'typed here'))
    act(() => api.saveFieldScratch({ ...caption, key: 'other' }, 'chapters', 'more'))
    const stored = window.localStorage.length
    const scan = vi.spyOn(window.localStorage, 'key')
    act(() => { for (const text of ['b', 'bc', 'bcd']) api.saveDraft(caption, text, null) })
    // The browser copy of the draft itself walks storage once per save (plan 3); scratch adds nothing.
    expect(scan.mock.calls.length).toBe(3 * stored)
    expect(api.readFieldScratch(caption, 'chapters')).toBe('typed here')
  })
})
