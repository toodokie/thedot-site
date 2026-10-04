import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const submit = vi.fn()
vi.mock('../../feedback-actions', () => ({ submitPortalFeedback: (...args: unknown[]) => submit(...args) }))

import FeedbackCard from './FeedbackCard'

beforeEach(() => {
  submit.mockReset()
  submit.mockResolvedValue({ ok: true })
  sessionStorage.clear()
})

describe('FeedbackCard', () => {
  it('appears as a dialog with five rating dots, a comment, Close and Send', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    const card = await screen.findByRole('dialog', { name: 'How is the new review page?' })
    expect(card).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('radio', { name: '4 of 5' })).toBeInTheDocument()
    expect(screen.getByLabelText('Comment (optional)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })

  it('fills the dots up to the chosen rating and enables Send', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('radio', { name: '4 of 5' }))
    const filled = document.querySelectorAll('[data-filled="true"]')
    expect(filled).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  })

  it('Close hides it for this visit only', async () => {
    const { unmount } = render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    sessionStorage.clear() // a new visit
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does not appear on the visit she read the rollout note', async () => {
    sessionStorage.setItem('kanset-portal:announcement-this-visit', '1')
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    await act(async () => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the answer, thanks her, then goes away', async () => {
    render(<FeedbackCard slug="kanset" contentItemId="item-1" />)
    fireEvent.click(await screen.findByRole('radio', { name: '5 of 5' }))
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'Much easier on my phone.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(submit).toHaveBeenCalledWith('kanset', {
      rating: 5, comment: 'Much easier on my phone.', contentItemId: 'item-1',
    }))
    expect(await screen.findByText('Thank you. I read every answer.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('keeps her answer and says so when the send fails', async () => {
    submit.mockResolvedValue({ ok: false, error: 'That did not send. Your answer is still here, so you can try again.' })
    render(<FeedbackCard slug="kanset" contentItemId={null} />)
    fireEvent.click(await screen.findByRole('radio', { name: '3 of 5' }))
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'Frames are small.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That did not send.')
    expect(screen.getByLabelText('Comment (optional)')).toHaveValue('Frames are small.')
    expect(screen.getByRole('radio', { name: '3 of 5' })).toBeChecked()
  })
})
