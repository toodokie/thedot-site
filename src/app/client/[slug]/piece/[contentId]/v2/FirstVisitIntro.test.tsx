import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { acknowledgePiecePageIntro } = vi.hoisted(() => ({ acknowledgePiecePageIntro: vi.fn(async () => undefined) }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ acknowledgePiecePageIntro }))

import FirstVisitIntro, { PIECE_PAGE_INTRO_LINES } from './FirstVisitIntro'
import { stubDialogs } from './test-utils'

beforeEach(() => { stubDialogs(); acknowledgePiecePageIntro.mockClear(); sessionStorage.clear() })

describe('FirstVisitIntro', () => {
  it('shows the four point-form lines (the intro plus the feedback card line) signed by Anastasia', () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    expect(screen.getByRole('dialog', { name: 'Your review page, rebuilt' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
    expect(screen.getByText('Next time you visit, a small card will ask how the new page works for you. One tap is plenty.'))
      .toBeInTheDocument()
    expect(screen.getByText('Anastasia')).toBeInTheDocument()
    for (const line of PIECE_PAGE_INTRO_LINES) expect(line).not.toMatch(/\u2014/)
  })

  it('contains no em dash and no "we"', () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\u2014/)
    expect(text).not.toMatch(/\bwe\b/i)
  })

  it('marks this visit on Got it so the feedback card waits for her next visit', async () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalled())
    expect(sessionStorage.getItem('kanset-portal:announcement-this-visit')).toBe('1')
  })

  it('acknowledges on Got it and closes', async () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalledWith('kanset'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('acknowledges on Escape', async () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalled())
  })

  it('fails open when the acknowledgment cannot be written', async () => {
    acknowledgePiecePageIntro.mockRejectedValueOnce(new Error('offline'))
    render(<FirstVisitIntro slug="kanset" show persist />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgePiecePageIntro).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('writes nothing in the preview and does not show once acknowledged', () => {
    const { unmount } = render(<FirstVisitIntro slug="kanset" show persist={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(acknowledgePiecePageIntro).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('kanset-portal:announcement-this-visit')).toBeNull()
    unmount()
    render(<FirstVisitIntro slug="kanset" show={false} persist />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
