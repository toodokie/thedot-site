import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../request-actions', () => ({
  requestContentRemoval: vi.fn(async () => ({})),
}))

import RemovalRequestForm from './RemovalRequestForm'

describe('RemovalRequestForm', () => {
  it('keeps the destructive request details collapsed until requested', () => {
    render(<RemovalRequestForm slug="kanset" contentId="piece-1" idempotencyKey="key-1" />)

    const reveal = screen.getByRole('button', { name: 'Request removal' })
    expect(reveal).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText(/Why should this piece be removed/)).not.toBeInTheDocument()

    fireEvent.click(reveal)

    const reason = screen.getByLabelText(/Why should this piece be removed/)
    expect(reason).toBeInTheDocument()
    expect(reason).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByLabelText(/Why should this piece be removed/)).not.toBeInTheDocument()
  })
})
