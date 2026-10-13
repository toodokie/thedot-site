import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReviewFlowIntro from './ReviewFlowIntro'

const { acknowledgeReviewFlowAnnouncement } = vi.hoisted(() => ({
  acknowledgeReviewFlowAnnouncement: vi.fn(async () => undefined),
}))
vi.mock('../../request-actions', () => ({ acknowledgeReviewFlowAnnouncement }))

describe('ReviewFlowIntro', () => {
  beforeEach(() => {
    acknowledgeReviewFlowAnnouncement.mockClear()
    HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    })
    HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
      this.removeAttribute('open')
    })
  })

  it('explains the simplified flow once and acknowledges Got it', async () => {
    render(<ReviewFlowIntro slug="kanset" show />)
    expect(screen.getByRole('dialog')).toBeVisible()
    expect(screen.getByText('We simplified the review page')).toBeVisible()
    expect(screen.getByText(/One button at the bottom/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(acknowledgeReviewFlowAnnouncement).toHaveBeenCalledWith('kanset'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not render after the seat has acknowledged it', () => {
    render(<ReviewFlowIntro slug="kanset" show={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
