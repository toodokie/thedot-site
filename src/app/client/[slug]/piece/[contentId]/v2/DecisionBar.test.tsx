import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
const { sendReviewBundle, decide } = vi.hoisted(() => ({
  sendReviewBundle: vi.fn(async () => ({ success: 'Your edit was sent to The Dot.' })),
  decide: vi.fn<(form: FormData) => Promise<{ error?: string }>>(async () => ({})),
}))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle, acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/actions', () => ({ decide }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { PieceAction } from '@/lib/portal/piece-page/piece-action'
import { useReviewDrafts } from '../ReviewDraftProvider'
import DecisionBar from './DecisionBar'
import { PageProviders, renderInPage, stubDialogs } from './test-utils'

function AddDraft() {
  const { saveDraft } = useReviewDrafts()
  return <button type="button" onClick={() => saveDraft({ kind: 'copy_block', key: 'caption', label: 'Caption', currentText: 'Old' }, 'New')}>add</button>
}

function bar(action: PieceAction, overrides: Partial<React.ComponentProps<typeof DecisionBar>> = {}) {
  return <DecisionBar action={action} ticks={{ total: 3, done: 2 }} version={2} reReview={false}
    approvedLabel="Approved · posts Fri Oct 2" postedLabel="Posted Fri Oct 2" sentSummary={{ count: 2, dateLabel: 'Sep 30' }}
    slug="kanset" contentId="piece" mode="client" canEdit onOpenPastEdits={vi.fn()} onShowCarried={vi.fn()} {...overrides} />
}

beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  sendReviewBundle.mockClear()
  decide.mockClear()
})

describe('DecisionBar', () => {
  it('keeps Approve off until every tab is reviewed and names the tab still to open', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['YouTube'] }))
    expect(screen.getByRole('region', { name: 'Your review' })).toBeInTheDocument()
    expect(screen.getByText('2 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByText('Open YouTube to finish your review.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription('Open YouTube to finish your review.')
  })

  it('says the earlier ticks were cleared on a new version', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'ticks', untickedLabels: ['On-screen text', 'Caption', 'YouTube'] },
      { ticks: { total: 3, done: 0 }, reReview: true }))
    expect(screen.getByText('0 of 3 reviewed')).toBeInTheDocument()
    expect(screen.getByText('New version 2. Your earlier ticks are cleared for this version.')).toBeInTheDocument()
  })

  it('waits for the media', () => {
    renderInPage(bar({ kind: 'approve', enabled: false, reason: 'media', untickedLabels: [] }, { ticks: { total: 3, done: 3 } }))
    expect(screen.getByText('You can approve once the video is here. I will let you know.')).toBeInTheDocument()
  })

  it('approves with an optional note', async () => {
    renderInPage(bar({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] }, { ticks: { total: 3, done: 3 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a note' }))
    fireEvent.change(screen.getByLabelText('Add a note (optional)'), { target: { value: 'Lovely.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(decide).toHaveBeenCalled())
    const form = decide.mock.calls[0][0] as FormData
    expect([form.get('slug'), form.get('contentId'), form.get('decision'), form.get('note')]).toEqual(['kanset', 'piece', 'approved', 'Lovely.'])
  })

  it('sends the drafts with one button and shows the result', async () => {
    renderInPage(<><AddDraft />{bar({ kind: 'send', count: 1, additional: false, retry: false, blocked: null })}</>)
    fireEvent.click(screen.getByRole('button', { name: 'add' }))
    expect(screen.getByText('1 unsent edit')).toBeInTheDocument()
    expect(screen.getByText('Saved, not sent yet. Nothing reaches me until you send.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send my edits (1)' }))
    await waitFor(() => expect(sendReviewBundle).toHaveBeenCalled())
    expect(await screen.findByRole('status')).toHaveTextContent('Your edit was sent to The Dot.')
  })

  it('labels follow-up and retry sends, and blocks an over-limit send', () => {
    const { rerender } = renderInPage(bar({ kind: 'send', count: 2, additional: true, retry: false, blocked: null }))
    expect(screen.getByRole('button', { name: 'Send additional edits (2)' })).toBeEnabled()
    rerender(<PageProviders>{bar({ kind: 'send', count: 2, additional: false, retry: true, blocked: null })}</PageProviders>)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled()
    expect(screen.getByText('Your 2 edits did not send. They are still saved here.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'send', count: 1, additional: false, retry: false, blocked: 'over-limit' })}</PageProviders>)
    expect(screen.getByRole('button', { name: 'Send my edits (1)' })).toBeDisabled()
    expect(screen.getByText('One edit is over the 50,000 character limit. Shorten it, then send.')).toBeInTheDocument()
  })

  it('shows each status state with no action', () => {
    const onOpenPastEdits = vi.fn()
    const { rerender } = renderInPage(bar({ kind: 'revision' }, { onOpenPastEdits }))
    expect(screen.getByText("I'm applying your edits")).toBeInTheDocument()
    expect(screen.getByText('You sent 2 edits on Sep 30. The new version will show here. Editing is paused until then.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'See what you sent' }))
    expect(onOpenPastEdits).toHaveBeenCalled()
    rerender(<PageProviders>{bar({ kind: 'sent', count: 2 })}</PageProviders>)
    expect(screen.getByText('Your edits are with me')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'decided' })}</PageProviders>)
    expect(screen.getByText('Approved · posts Fri Oct 2')).toBeInTheDocument()
    expect(screen.getByText('Thank you. Nothing else needed from you.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'published' })}</PageProviders>)
    expect(screen.getByText('Posted Fri Oct 2')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'incomplete', missing: ['website cover'] })}</PageProviders>)
    expect(screen.getByText('I still need to add: website cover.')).toBeInTheDocument()
    rerender(<PageProviders>{bar({ kind: 'decider-only' })}</PageProviders>)
    expect(screen.getByText('Only Maria can approve this piece. You can still edit the text.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('does not promise editing to a seat that cannot edit', () => {
    renderInPage(bar({ kind: 'decider-only' }, { canEdit: false }))
    expect(screen.getByText('Only Maria can approve this piece.')).toBeInTheDocument()
    expect(screen.queryByText(/You can still edit the text/)).not.toBeInTheDocument()
  })

  it('points to drafts written against the previous version', () => {
    const onShowCarried = vi.fn()
    renderInPage(bar({ kind: 'carried', count: 1 }, { onShowCarried }))
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }))
    expect(onShowCarried).toHaveBeenCalled()
  })

  it('never sends or approves from the read-only preview', async () => {
    renderInPage(bar({ kind: 'approve', enabled: true, reason: null, untickedLabels: [] }, { mode: 'preview', ticks: { total: 3, done: 3 } }))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Read-only preview: nothing was sent.')).toBeInTheDocument()
    expect(decide).not.toHaveBeenCalled()
  })

  it('renders nothing when there is nothing to do', () => {
    renderInPage(bar({ kind: 'none' }))
    expect(screen.queryByRole('region', { name: 'Your review' })).not.toBeInTheDocument()
  })
})
