import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { requestScheduleChange } = vi.hoisted(() => ({ requestScheduleChange: vi.fn(async (_formData: FormData): Promise<{ error?: string }> => ({ error: 'That time is skipped when the clocks change.' })) }))
vi.mock('@/app/client/[slug]/schedule-actions', () => ({ requestScheduleChange }))

import ScheduleRequest from './ScheduleRequest'
import { stubDialogs } from './test-utils'

beforeEach(() => stubDialogs())

describe('ScheduleRequest', () => {
  it('shows a pending request instead of the link', () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets active={{ kind: 'reschedule', when: 'Oct 3, 2026, 6:00 p.m.' }} />)
    expect(screen.getByText('New date requested for Oct 3, 2026, 6:00 p.m.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request another date' })).not.toBeInTheDocument()
  })

  it('shows nothing to a seat that cannot request', () => {
    const { container } = render(<ScheduleRequest slug="kanset" contentId="piece" canRequest={false} hasExternalTargets active={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('opens a small form and shows the server reason when refused', async () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets active={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request another date' }))
    expect(screen.getByRole('dialog', { name: 'Request another date' })).toBeVisible()
    fireEvent.change(screen.getByLabelText('Requested Toronto date and time'), { target: { value: '2026-10-05T18:00' } })
    fireEvent.submit(screen.getByLabelText('Requested Toronto date and time').closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('That time is skipped when the clocks change.')
    const sent = requestScheduleChange.mock.calls[0][0]
    expect(sent.get('slug')).toBe('kanset')
    expect(sent.get('contentId')).toBe('piece')
    expect(sent.get('requestedLocal')).toBe('2026-10-05T18:00')
  })

  it('asks for an editorial date when nothing is scheduled externally', () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets={false} active={null} />)
    fireEvent.click(screen.getByRole('button', { name: 'Request another date' }))
    expect(screen.getByLabelText('Editorial plan date')).toHaveAttribute('type', 'date')
  })

  it('returns focus to the link when the form closes', () => {
    render(<ScheduleRequest slug="kanset" contentId="piece" canRequest hasExternalTargets active={null} />)
    const link = screen.getByRole('button', { name: 'Request another date' })
    fireEvent.click(link)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(link).toHaveFocus()
  })
})
