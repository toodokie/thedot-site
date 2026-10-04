import { act, fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { renderInPage, stubDialogs } from '../test-utils'
import OnScreenTextPanel from './OnScreenTextPanel'
import CopyPanel from './CopyPanel'
import DocumentPanel from './DocumentPanel'

const SCRIPT = 'Three frames.\n\n**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION\n\n**3.** BOOK A CONSULTATION'
const onscreen: CopyTab = { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel, on screen', body: SCRIPT }] }
const frames = [1, 2, 3].map((n) => ({ label: `${n} s`, url: `https://signed.example/f${n}.jpg` }))
const caption: CopyTab = { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: 'First paragraph.\n\nSecond paragraph, edited.' }] }
const PDF = '**Page 1, cover**\n\nGUIDE\n\n**Page 2, the fee**\n\nPAID BEFORE HIRING.'
const pdf: CopyTab = { key: 'document', kind: 'document', label: 'PDF text', blocks: [{ key: 'linkedin-document-copy', label: 'LinkedIn PDF copy', body: PDF }] }

const writeText = vi.fn(async () => undefined)
beforeEach(() => {
  stubDialogs()
  window.localStorage.clear()
  writeText.mockClear()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
})

describe('OnScreenTextPanel', () => {
  it('lists every frame beside its thumbnail with Edit text and Suggest a change', () => {
    const onSuggestFrame = vi.fn()
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={onSuggestFrame} version={2} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Frame 2')).toBeInTheDocument()
    expect(rows[1].querySelector('img')).toHaveAttribute('src', 'https://signed.example/f2.jpg')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change to frame 2' }))
    expect(onSuggestFrame).toHaveBeenCalledWith(1)
  })

  it('edits one frame and marks it edited, not sent', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={null} version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    const field = screen.getByLabelText('Text')
    expect(field).toHaveValue('**2.** $1,000 PER POSITION')
    fireEvent.change(field, { target: { value: '**2.** $1,000 PER POSITION, PAID BY THE EMPLOYER' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByText('Edited, not sent')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Edited, not sent')).not.toBeInTheDocument()
    expect(screen.getByText('Saved · not sent yet')).toBeInTheDocument()
  })

  it('opens a frame on her unsent draft and keeps every other frame edit', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={null} version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '**2.** EDITED TWO' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 3' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '**3.** EDITED THREE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Frame 2' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**2.** EDITED TWO')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByText('EDITED TWO', { exact: false })).toBeInTheDocument()
    expect(within(rows[2]).getByText('EDITED THREE', { exact: false })).toBeInTheDocument()
  })

  it('marks a frame that changed since the previous version', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{ 'reel-script': SCRIPT.replace('$1,000', '$900') }} canEdit onSuggestFrame={null} version={2} />)
    const changed = document.querySelectorAll('[data-changed="true"]')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toHaveTextContent('$1,000 PER POSITION')
  })

  it('shows Editing is closed and no actions when editing is off', () => {
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit={false} onSuggestFrame={null} version={2} />)
    expect(screen.getByText('Editing is closed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Edit text/ })).not.toBeInTheDocument()
  })

  it('shows a draft written against the previous version with Keep, Adjust and Discard', () => {
    const carried: ServerDraftRow = {
      id: '11111111-1111-4111-8111-111111111111', content_item_id: 'item', base_version: 1, target_kind: 'copy_block',
      target_key: 'reel-script', anchor: '', anchor_label: null, target_label: 'Reel, on screen', url_snapshot: null,
      quoted_text: null, body: 'An edit from version 1', status: 'unsent', saved_at: '2026-10-01T10:00:00.000Z',
      updated_at: '2026-10-01T10:00:00.000Z', carried_over_at: '2026-10-02T10:00:00.000Z', carried_over_to_version: 2,
      send_failed_at: null, last_send_error: null,
    }
    renderInPage(<OnScreenTextPanel tab={onscreen} frames={frames} before={{}} canEdit onSuggestFrame={null} version={2} />,
      { serverDrafts: [carried] })
    const notice = screen.getByRole('region', { name: 'Edit written against version 1' })
    expect(within(notice).getByText('Written against the previous version')).toBeInTheDocument()
    expect(within(notice).getByText('An edit from version 1')).toBeInTheDocument()
    expect(within(notice).getByRole('button', { name: 'Adjust' })).toBeInTheDocument()
    fireEvent.click(within(notice).getByRole('button', { name: 'Discard' }))
    expect(within(notice).getByText('Discard this edit? It cannot be recovered.')).toBeInTheDocument()
    fireEvent.click(within(notice).getByRole('button', { name: 'Keep it' }))
    fireEvent.click(within(notice).getByRole('button', { name: 'Keep my edit' }))
    expect(screen.queryByRole('region', { name: 'Edit written against version 1' })).not.toBeInTheDocument()
  })
})

describe('CopyPanel', () => {
  it('highlights the paragraphs that changed after her feedback', () => {
    renderInPage(<CopyPanel tab={caption} before={{ 'social-caption': 'First paragraph.\n\nSecond paragraph.' }} canEdit version={2} />)
    const changed = document.querySelectorAll('[data-changed="true"]')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toHaveTextContent('Second paragraph, edited.')
  })

  it('edits the whole caption and copies the plain text', async () => {
    renderInPage(<CopyPanel tab={caption} before={{}} canEdit version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy text' }))
    await act(async () => {})
    expect(writeText).toHaveBeenCalledWith('First paragraph.\n\nSecond paragraph, edited.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Caption' }))
    expect(screen.getByLabelText('Text')).toHaveValue('First paragraph.\n\nSecond paragraph, edited.')
  })
})

describe('DocumentPanel', () => {
  it('lists the text page by page, follows the page in view and jumps to a page', () => {
    const onPageChange = vi.fn()
    renderInPage(<DocumentPanel tab={pdf} page={1} onPageChange={onPageChange} pageThumbs={[]} before={{}} canEdit version={2} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Show page 1' }))
    expect(onPageChange).toHaveBeenCalledWith(0)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Page 2' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**Page 2, the fee**\n\nPAID BEFORE HIRING.')
  })

  it('opens a page on her unsent draft, not the released text', () => {
    renderInPage(<DocumentPanel tab={pdf} page={0} onPageChange={vi.fn()} pageThumbs={[]} before={{}} canEdit version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Page 2' }))
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: '**Page 2, the fee**\n\nPAID BY THE EMPLOYER.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit text, Page 2' }))
    expect(screen.getByLabelText('Text')).toHaveValue('**Page 2, the fee**\n\nPAID BY THE EMPLOYER.')
  })
})
