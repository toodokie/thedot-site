import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import SuggestEditForm from './SuggestEditForm'
import ReviewDraftProvider from './ReviewDraftProvider'
import { editDraftKey } from '@/lib/portal/edit-drafts'
const draftActions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => draftActions)
vi.mock('../../request-actions', () => ({ sendReviewBundle: vi.fn() }))

function subject() {
  return <ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}>
    <SuggestEditForm targetKind="copy_block" targetKey="article-body"
      targetLabel="Article body" currentText="Current article." />
  </ReviewDraftProvider>
}

describe('SuggestEditForm draft recovery', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      get length() { return values.size }, clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key) },
      setItem: (key: string, value: string) => { values.set(key, value) },
    } })
  })

  it('restores a version-scoped draft', async () => {
    const key = editDraftKey('maria-user', 'kanset', 'episode-two', 3, 'copy_block', 'article-body')
    window.localStorage.setItem(key, JSON.stringify({ proposedText: 'Maria rewrote this article.' }))
    render(subject())
    expect(await screen.findByDisplayValue('Maria rewrote this article.')).toBeVisible()
    expect(screen.getByText(/saved in this browser/i)).toBeVisible()
  })

  it('saves a full-block edit without sending it immediately', async () => {
    const key = editDraftKey('maria-user', 'kanset', 'episode-two', 3, 'copy_block', 'article-body')
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A recovered rewrite.' } })
    expect(JSON.parse(window.localStorage.getItem(key) ?? '{}').proposedText).toBe('A recovered rewrite.')
    expect(screen.queryByRole('button', { name: /send suggestion/i })).not.toBeInTheDocument()
    expect(screen.getByText('Draft saved in this browser. It has not been sent yet.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Save and close' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Review and send edits' })).toBeVisible()
  })

  it('takes a saved draft directly to the bundle send action', () => {
    const finish = document.createElement('div')
    finish.id = 'review-decision'
    finish.scrollIntoView = vi.fn()
    document.body.appendChild(finish)
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A recovered rewrite.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review and send edits' }))
    expect(finish.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('asks before discarding a saved edit', () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A rewrite to throw away.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard edit' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    expect(screen.getByDisplayValue('A rewrite to throw away.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.queryByDisplayValue('A rewrite to throw away.')).not.toBeInTheDocument()
  })

  it('saves to the server when the editor loses focus', async () => {
    draftActions.saveReviewDraft.mockImplementation(async (input: { body: string; savedAt: string }) => ({
      outcome: 'saved', draft: { id: '11111111-1111-4111-8111-111111111111', base_version: 3, saved_at: input.savedAt,
        send_failed_at: null } }))
    render(<ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}
      serverSync initialServerDrafts={[]}>
      <SuggestEditForm targetKind="copy_block" targetKey="article-body"
        targetLabel="Article body" currentText="Current article." />
    </ReviewDraftProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    const field = screen.getByLabelText('Edit Article body')
    fireEvent.change(field, { target: { value: 'Saved on blur.' } })
    await act(async () => { fireEvent.blur(field) })
    expect(draftActions.saveReviewDraft).toHaveBeenCalledWith(expect.objectContaining({ body: 'Saved on blur.' }))
    expect(await screen.findByText('Saved · not sent yet')).toBeVisible()
  })

  it('marks an edit written against the previous version and lets her keep it', async () => {
    draftActions.saveReviewDraft.mockImplementation(async (input: { body: string; savedAt: string; baseVersion: number }) => ({
      outcome: 'saved', draft: { id: '11111111-1111-4111-8111-111111111111', base_version: input.baseVersion,
        saved_at: input.savedAt, send_failed_at: null } }))
    render(<ReviewDraftProvider draftScope="maria-user" slug="kanset" contentId="episode-two" version={3}
      serverSync initialServerDrafts={[{
        id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 2,
        target_kind: 'copy_block', target_key: 'article-body', anchor: '', anchor_label: null,
        target_label: 'Article body', url_snapshot: null, quoted_text: null, body: 'Written on version 2.',
        status: 'unsent', saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z',
        carried_over_at: '2026-10-03T11:00:00.000Z', carried_over_to_version: 3, send_failed_at: null, last_send_error: null,
      }]}>
      <SuggestEditForm targetKind="copy_block" targetKey="article-body"
        targetLabel="Article body" currentText="Current article." />
    </ReviewDraftProvider>)
    expect(await screen.findByText(/Written against version 2/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Keep this edit' }))
    expect(screen.queryByText(/Written against version 2/)).not.toBeInTheDocument()
  })

  it('moves focus into the discard prompt and back to the trigger on keep editing', () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Suggest edit' }))
    fireEvent.change(screen.getByLabelText('Edit Article body'), { target: { value: 'A rewrite to keep.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard edit' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Discard this edit? It cannot be recovered.')
    expect(screen.getByRole('button', { name: 'Yes, discard' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByRole('button', { name: 'Discard edit' })).toHaveFocus()
    expect(screen.getByDisplayValue('A rewrite to keep.')).toBeVisible()
  })
})
