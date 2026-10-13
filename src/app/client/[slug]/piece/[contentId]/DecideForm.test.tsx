import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DecideForm from './DecideForm'
import { decide } from '../../actions'

vi.mock('../../actions', () => ({ decide: vi.fn(async () => ({})) }))

describe('DecideForm', () => {
  it('offers approval only', async () => {
    render(<DecideForm slug="kanset" contentId="episode-two" />)
    expect(screen.queryByRole('button', { name: /request package changes/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve package' }))
    await waitFor(() => expect(decide).toHaveBeenCalledTimes(1))
  })
})
