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
vi.mock('../../request-actions', () => ({ sendReviewBundle }))
vi.mock('../../actions', () => ({ decide }))

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
    sendReviewBundle.mockClear()
    decide.mockClear()
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

  it('shows sent status without a second decision action', () => {
    render(subject({ sentEdits: [{ id: 'request-1', label: 'Instagram caption', status: 'pending' }] }))
    expect(screen.getByText('Changes requested')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Approve package' })).not.toBeInTheDocument()
  })

  it('shows a clear read-only state once revision production starts', () => {
    render(subject({
      sentEdits: [{ id: 'request-1', label: 'Instagram caption', status: 'applying' }],
      revisionStarted: true,
    }))
    expect(screen.getByText('Revision in progress')).toBeVisible()
    expect(screen.getByText(/started applying your edits/i)).toBeVisible()
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
})
