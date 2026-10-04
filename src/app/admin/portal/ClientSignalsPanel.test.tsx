import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ClientSignal } from '@/lib/portal/agency-ops-core'
import type { UnsentDraftAlert } from '@/lib/portal/review-drafts-core'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import ClientSignalsPanel from './ClientSignalsPanel'

const feedback: ClientSignal = {
  id: '1b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'portal_feedback_submitted', pieceKey: null, pieceTitle: null,
  headline: 'Feedback: 4 of 5', detail: 'Maria: “Much easier on my phone.”',
  createdAt: '2026-10-03T14:00:00.000Z', resolvable: true,
}
const failure: ClientSignal = {
  ...feedback, id: '2b4e28ba-2fa1-41d2-883f-0016d3cca427', kind: 'review_send_failed',
  pieceKey: 'kanset-reel', pieceTitle: 'Hiring cost reel', headline: 'Edits not sent: Hiring cost reel',
  detail: '2 edits refused (draft too long). Her text is saved.',
}
const alert: UnsentDraftAlert = {
  client_id: 'c', content_item_id: 'i', content_id: 'kanset-reel', title: 'Hiring cost reel',
  planned_date: '2026-10-04', auth_user_id: 'u', seat_name: 'Maria Guerts', unsent_count: 2,
  stale_count: 2, carried_count: 0, oldest_saved_at: '2026-10-02T14:00:00.000Z',
}

beforeEach(() => {
  refresh.mockReset()
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ result: { outcome: 'resolved' } }), { status: 200 })))
})

describe('ClientSignalsPanel', () => {
  it('renders nothing when there is nothing from Maria', () => {
    const { container } = render(<ClientSignalsPanel signals={[]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists unsent edits first, then failures and feedback, each linked to its piece', () => {
    render(<ClientSignalsPanel signals={[feedback, failure]} alerts={[alert]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('heading', { level: 2, name: 'From Maria' })).toBeInTheDocument()
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('Maria has 2 unsent edits on Hiring cost reel')
    expect(items[0]).toHaveTextContent('Saved 26 hours ago · posts in 1 day')
    expect(screen.getByRole('link', { name: 'Edits not sent: Hiring cost reel' }))
      .toHaveAttribute('href', '/admin/portal/pieces/kanset-reel')
    expect(screen.getByText('Feedback: 4 of 5')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Done/ })).toHaveLength(1)
  })

  it('gives a send failure no Done button, because it closes when her retry succeeds', () => {
    render(<ClientSignalsPanel signals={[failure]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    const row = screen.getByRole('listitem')
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
    expect(row).toHaveTextContent('Closes when her retry succeeds')
  })

  it('marks a signal done and refreshes the page', async () => {
    render(<ClientSignalsPanel signals={[feedback]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Feedback: 4 of 5' }))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/admin/portal/inbox-resolve')
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ eventId: feedback.id })
  })

  it('says so when Done fails, and keeps the row', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('{}', { status: 400 }))
    render(<ClientSignalsPanel signals={[feedback]} alerts={[]} error={null}
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    fireEvent.click(screen.getByRole('button', { name: 'Done: Feedback: 4 of 5' }))
    expect(await screen.findByText('Could not mark it done. Try again.')).toBeInTheDocument()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a read failure instead of hiding the panel', () => {
    render(<ClientSignalsPanel signals={[]} alerts={[]} error="client signals unavailable: boom"
      todayIso="2026-10-03" nowIso="2026-10-03T16:00:00.000Z" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load signals from Maria: client signals unavailable: boom')
  })
})
