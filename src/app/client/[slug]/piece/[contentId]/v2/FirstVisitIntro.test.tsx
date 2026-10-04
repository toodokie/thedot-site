import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { acknowledgePiecePageIntro } = vi.hoisted(() => ({ acknowledgePiecePageIntro: vi.fn(async () => undefined) }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ acknowledgePiecePageIntro }))

import FirstVisitIntro, { PIECE_PAGE_INTRO_LINES } from './FirstVisitIntro'
import { stubDialogs } from './test-utils'

beforeEach(() => { stubDialogs(); acknowledgePiecePageIntro.mockClear() })

describe('FirstVisitIntro', () => {
  it('shows three lines signed by Anastasia, with no em dashes', () => {
    render(<FirstVisitIntro slug="kanset" show persist />)
    expect(screen.getByRole('dialog', { name: 'Your review page, rebuilt' })).toBeVisible()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Anastasia')).toBeInTheDocument()
    for (const line of PIECE_PAGE_INTRO_LINES) expect(line).not.toMatch(/\u2014/)
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
    unmount()
    render(<FirstVisitIntro slug="kanset" show={false} persist />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
