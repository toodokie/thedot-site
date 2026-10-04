import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { addComment } = vi.hoisted(() => ({ addComment: vi.fn<(form: FormData) => Promise<{ error?: string }>>(async () => ({})) }))
vi.mock('@/app/client/[slug]/comment-actions', () => ({ addComment }))
vi.mock('@/app/client/[slug]/requests/RequestHistory', () => ({
  default: ({ requests }: { requests: unknown[] }) => <div data-testid="history">{requests.length} requests</div>,
}))

import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import QuestionsDrawer from './QuestionsDrawer'
import { stubDialogs } from './test-utils'

const comment = (overrides: Partial<CommentRow>): CommentRow => ({
  id: 'c', content_version: 2, copy_block_key: null, author_type: 'client', author_name: 'Maria', body: 'Is this for all of Ontario?',
  quoted_text: null, target_kind: 'copy', target_url: null, reply_to_comment_id: null, resolved: false,
  created_at: '2026-09-30T20:58:00Z', ...overrides,
})

const ledger = [{
  claim_key: 'fee', claim: 'The LMIA processing fee is $1,000 for each position requested.', status: 'confirmed',
  checked_at: '2026-09-25', checked_by_role: 'agency_fact_checker', source_type: 'primary_source',
  source_url: 'https://www.canada.ca/x', source_title: 'Program requirements, ESDC',
}] as ContentRow['fact_check_ledger']

function subject(overrides: Partial<React.ComponentProps<typeof QuestionsDrawer>> = {}) {
  return <QuestionsDrawer open tab="conversation" onTabChange={vi.fn()} onClose={vi.fn()} slug="kanset" contentId="piece"
    comments={[comment({ id: 'a' }), comment({ id: 'b', author_type: 'anastasia', author_name: 'Anastasia', body: 'All of Ontario.' }),
      comment({ id: 'd', target_kind: 'design', target_url: 'https://drive.google.com/x', body: 'Old asset note' })]}
    canComment ledger={ledger} factCheckScope="required" factCheckExemption={null} requests={[]} requestMessages={[]}
    item={{} as ContentRow} canReply {...overrides} />
}

beforeEach(() => { stubDialogs(); addComment.mockClear() })

describe('QuestionsDrawer', () => {
  it('is labelled and says it does not change the piece', () => {
    render(subject())
    const drawer = screen.getByRole('dialog', { name: 'Questions & sources' })
    expect(within(drawer).getByText("Doesn't change the piece. To change it, edit the text.")).toBeInTheDocument()
    expect(within(drawer).queryByText(/reply the same day/)).not.toBeInTheDocument()
  })

  it('shows the conversation, keeping historical labels', () => {
    render(subject())
    expect(screen.getByText('Is this for all of Ontario?')).toBeInTheDocument()
    expect(screen.getByText('All of Ontario.')).toBeInTheDocument()
    expect(screen.getByText(/Asset feedback/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the referenced asset' })).toHaveAttribute('href', 'https://drive.google.com/x')
  })

  it('posts a question through the existing comment action', async () => {
    render(subject())
    fireEvent.change(screen.getByLabelText('Ask a question or leave a note'), { target: { value: 'When does it post?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))
    await waitFor(() => expect(addComment).toHaveBeenCalled())
    const form = addComment.mock.calls[0][0] as FormData
    expect([form.get('slug'), form.get('contentId'), form.get('body'), form.get('targetKind')]).toEqual(['kanset', 'piece', 'When does it post?', 'copy'])
  })

  it('is read-only for a seat that cannot comment', () => {
    render(subject({ canComment: false }))
    expect(screen.getByText('Questions are read-only for your account.')).toBeInTheDocument()
  })

  it('lists the sources behind the facts', () => {
    render(subject({ tab: 'sources' }))
    expect(screen.getByText('The LMIA processing fee is $1,000 for each position requested.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Checked 2026-09-25 · Program requirements, ESDC' })).toHaveAttribute('href', 'https://www.canada.ca/x')
  })

  it('shows past edits from the request history', () => {
    render(subject({ tab: 'past', requests: [{ id: 'r' } as never] }))
    expect(screen.getByTestId('history')).toHaveTextContent('1 requests')
  })

  it('switches tabs and closes', () => {
    const onTabChange = vi.fn()
    const onClose = vi.fn()
    render(subject({ onTabChange, onClose }))
    fireEvent.click(screen.getByRole('tab', { name: 'Sources (1)' }))
    expect(onTabChange).toHaveBeenCalledWith('sources')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
