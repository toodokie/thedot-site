import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReviewDraftProvider, { useReviewDrafts } from './ReviewDraftProvider'
import ReviewVerdict from './ReviewVerdict'
import { useEffect } from 'react'
import { editDraftKey } from '@/lib/portal/edit-drafts'

const { sendReviewBundle, decide } = vi.hoisted(() => ({
  sendReviewBundle: vi.fn(async () => ({ success: 'Your edit was sent to The Dot.' })),
  decide: vi.fn(async () => ({})),
}))
const writeText = vi.fn(async () => undefined)
vi.mock('../../request-actions', () => ({ sendReviewBundle }))
vi.mock('../../actions', () => ({ decide }))
const draftActions = vi.hoisted(() => ({
  saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn(),
}))
vi.mock('../../draft-actions', () => draftActions)

function AddDraft() {
  const { saveDraft } = useReviewDrafts()
  return <button onClick={() => saveDraft({ kind: 'copy_block', key: 'caption', label: 'Instagram caption', currentText: 'Old' }, 'New')}>Add draft</button>
}

function RestoreDraft() {
  const { readDraft } = useReviewDrafts()
  useEffect(() => {
    readDraft({ kind: 'copy_block', key: 'caption', label: 'Instagram caption', currentText: 'Old' })
  }, [readDraft])
  return null
}

function subject(overrides: Partial<React.ComponentProps<typeof ReviewVerdict>> = {}) {
  const props = {
    slug: 'kanset', contentId: 'piece', contentVersion: 4, isPublished: false,
    needsReview: true, packageReady: true, missing: [], sentEdits: [], revisionStarted: false,
    canDecide: true,
    ...overrides,
  }
  return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={4}>
    <AddDraft />
    <RestoreDraft />
    <ReviewVerdict {...props} />
  </ReviewDraftProvider>
}

describe('ReviewVerdict resolver', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    Object.defineProperty(window, 'localStorage', { configurable: true, value: {
      get length() { return values.size }, clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => { values.delete(key) },
      setItem: (key: string, value: string) => { values.set(key, value) },
    } })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    sendReviewBundle.mockClear()
    decide.mockClear()
    writeText.mockClear()
  })

  it('shows one approval action for a clean complete package', () => {
    render(subject())
    expect(screen.getByRole('button', { name: 'Approve package' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /send my edits/i })).not.toBeInTheDocument()
  })

  it('replaces approval with one bundle action when a draft exists', () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Add draft' }))
    expect(screen.getByRole('button', { name: 'Send my edits (1)' })).toBeVisible()
    expect(screen.getByText('1 unsent edit saved')).toBeVisible()
    expect(screen.getByRole('link', { name: 'Review and send' })).toHaveAttribute('href', '#review-decision')
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
  })

  it('restores a saved draft before approval can be offered', async () => {
    const key = editDraftKey('maria', 'kanset', 'piece', 4, 'copy_block', 'caption')
    window.localStorage.setItem(key, JSON.stringify({ proposedText: 'Saved revision' }))
    render(subject())
    expect(await screen.findByRole('button', { name: 'Send my edits (1)' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
  })

  it('stacks incomplete status above the draft action', () => {
    render(subject({ packageReady: false, missing: ['Final video'] }))
    fireEvent.click(screen.getByRole('button', { name: 'Add draft' }))
    expect(screen.getByText('Package still being assembled')).toBeVisible()
    expect(screen.getByText('Final video')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send my edits (1)' })).toBeVisible()
  })

  it('shows and copies sent wording without a second decision action', async () => {
    render(subject({ sentEdits: [{
      id: 'request-1', label: 'Instagram caption', status: 'pending',
      proposedText: '**Use this same legal wording** in the next segment.',
    }] }))
    expect(screen.getByText('Changes requested')).toBeVisible()
    expect(screen.getByText('Use this same legal wording')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('**Use this same legal wording** in the next segment.'))
    expect(screen.getByRole('button', { name: 'Copied' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
  })

  it('shows a clear read-only state once revision production starts', () => {
    render(subject({
      sentEdits: [{
        id: 'request-1', label: 'Instagram caption', status: 'applying',
        proposedText: 'Use this submitted wording while the revision is in progress.',
      }],
      revisionStarted: true,
    }))
    expect(screen.getByText('Revision in progress')).toBeVisible()
    expect(screen.getByText(/started applying your edits/i)).toBeVisible()
    expect(screen.getByText('Use this submitted wording while the revision is in progress.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /send|approve/i })).not.toBeInTheDocument()
  })

  it('clears drafts only after a confirmed bundle send', async () => {
    render(subject())
    fireEvent.click(screen.getByRole('button', { name: 'Add draft' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send my edits (1)' }))
    await waitFor(() => expect(sendReviewBundle).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Your edit was sent to The Dot.')).toBeVisible()
    expect(screen.queryByRole('button', { name: /send my edits/i })).not.toBeInTheDocument()
  })

  function serverSubject(rows: Array<Record<string, unknown>>) {
    return <ReviewDraftProvider draftScope="maria" slug="kanset" contentId="piece" version={4}
      serverSync initialServerDrafts={rows as never}>
      <ReviewVerdict slug="kanset" contentId="piece" contentVersion={4} isPublished={false} needsReview
        packageReady missing={[]} sentEdits={[]} revisionStarted={false} canDecide />
    </ReviewDraftProvider>
  }
  const serverRow = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 4,
    target_kind: 'copy_block', target_key: 'caption', anchor: '', anchor_label: null, target_label: 'Instagram caption',
    url_snapshot: null, quoted_text: null, body: 'Saved on the server', status: 'unsent',
    saved_at: '2026-10-03T10:00:00.000Z', updated_at: '2026-10-03T10:00:00.000Z', carried_over_at: null,
    carried_over_to_version: null, send_failed_at: null, last_send_error: null, ...overrides,
  })

  it('blocks approval while a carried edit waits, and asks before discarding it', () => {
    render(serverSubject([serverRow({ base_version: 3, carried_over_at: '2026-10-03T11:00:00.000Z', carried_over_to_version: 4 })]))
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
    expect(screen.getByText('Written against the previous version')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByText('Discard this edit? It cannot be recovered.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, discard' }))
    expect(screen.getByRole('button', { name: 'Approve package' })).toBeVisible()
  })

  it('offers a retry and keeps the edit when sending fails', async () => {
    draftActions.sendReviewDrafts.mockResolvedValue({ error: 'Your edits could not be sent. They are still saved, and we have your text.' })
    render(serverSubject([serverRow()]))
    fireEvent.click(screen.getByRole('button', { name: 'Send my edits (1)' }))
    expect(await screen.findByText('Your edits could not be sent. They are still saved, and we have your text.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry sending (1)' })).toBeVisible()
    expect(screen.getByText("Couldn't send. Retry")).toBeVisible()
  })

  it('moves focus into the carried discard prompt and back to Discard on cancel', () => {
    render(serverSubject([serverRow({ base_version: 3, carried_over_at: '2026-10-03T11:00:00.000Z', carried_over_to_version: 4 })]))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Discard this edit? It cannot be recovered.')
    expect(screen.getByRole('button', { name: 'Yes, discard' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('button', { name: 'Discard' })).toHaveFocus()
  })
})
