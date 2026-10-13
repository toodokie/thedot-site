import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import PlanDecideForm from './PlanDecideForm'

vi.mock('../plan-actions', () => ({ decidePlanCycle: vi.fn(async () => ({})) }))

const props = { slug: 'kanset', cycleId: 'cycle-1', revision: 3 }

describe('PlanDecideForm', () => {
  it('keeps the change note hidden until the client requests changes', () => {
    render(<PlanDecideForm {...props} />)

    expect(screen.getByRole('button', { name: 'Approve this plan' })).toBeInTheDocument()
    expect(screen.queryByLabelText('What would you like changed?')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Request changes' }))

    expect(screen.getByLabelText('What would you like changed?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send change request' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('renders an approval-only action near the plan summary', () => {
    render(<PlanDecideForm {...props} mode="approve" />)

    expect(screen.getByRole('button', { name: 'Approve this plan' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Request changes' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
