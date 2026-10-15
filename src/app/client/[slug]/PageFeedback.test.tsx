import { fireEvent, render, screen } from '@testing-library/react'
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import StalePageNotice from './StalePageNotice'
import PageFeedback from './PageFeedback'

const { addIdea } = vi.hoisted(() => ({ addIdea: vi.fn() }))
vi.mock('./idea-actions', () => ({ addIdea }))

beforeEach(() => addIdea.mockReset())

describe('PageFeedback', () => {
  it('shows the reload notice when feedback belongs to an older deploy', async () => {
    addIdea.mockRejectedValueOnce(new UnrecognizedActionError('Failed to find Server Action'))
    render(<><StalePageNotice /><PageFeedback slug="kanset" topic="Strategy" /></>)

    fireEvent.change(screen.getByLabelText('Your comment'), { target: { value: 'Please clarify this.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The portal was just updated.')
    expect(screen.getByLabelText('Your comment')).toHaveValue('Please clarify this.')
  })
})
