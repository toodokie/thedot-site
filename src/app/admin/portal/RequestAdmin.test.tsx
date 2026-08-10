import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RequestList, type AdminContentRequest } from './RequestAdmin'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

function request(overrides: Partial<AdminContentRequest> = {}): AdminContentRequest {
  return {
    id: '0798ce6f-8d91-4853-84ae-a46ddc659e39', clientName: 'Kanset Services Inc.',
    requestType: 'edit', status: 'pending', requesterName: 'Maria Guerts',
    createdAt: '2026-08-10T13:11:53.260031+00:00', title: 'Monday roundup',
    contentUuid: 'piece-1', baseVersion: 6, resolutionNote: null,
    edit: { blockKey: 'social-caption', blockLabel: 'Instagram + Facebook caption',
      originalText: 'Current v6 copy.', proposedText: 'Maria requested copy.' },
    reviewCandidate: { candidateText: 'Recommended final copy.',
      changeSummary: 'Accepted: the stronger opening.\nRephrased: the legal label for accuracy.',
      status: 'draft', revision: 2, approvedAt: null,
      updatedAt: '2026-08-10T15:00:00.000000+00:00' },
    messages: [],
    ...overrides,
  }
}

describe('RequestList safe-merge review', () => {
  it('shows the current, requested, and recommended copy together before approval', () => {
    render(<RequestList requests={[request()]} />)

    const review = screen.getByText('Review edit to Instagram + Facebook caption').closest('details')
    expect(review).not.toBeNull()
    const scoped = within(review as HTMLElement)
    expect(scoped.getByText('Current text, v6')).toBeInTheDocument()
    expect(scoped.getByText('Current v6 copy.')).toBeInTheDocument()
    expect(scoped.getByText('Maria’s proposed text')).toBeInTheDocument()
    expect(scoped.getByText('Maria requested copy.')).toBeInTheDocument()
    expect(scoped.getByDisplayValue('Recommended final copy.')).toBeInTheDocument()
    expect(scoped.getByDisplayValue(/Accepted: the stronger opening/)).toBeInTheDocument()
    expect(scoped.getByRole('button', { name: 'Approve candidate' })).toBeEnabled()
  })

  it('labels an approved candidate without treating it as applied copy', () => {
    render(<RequestList requests={[request({
      reviewCandidate: { candidateText: 'Approved recommendation.', changeSummary: 'Accepted exactly.',
        status: 'approved', revision: 3, approvedAt: '2026-08-10T15:05:00.000000+00:00',
        updatedAt: '2026-08-10T15:05:00.000000+00:00' },
    })]} />)

    expect(screen.getByText('Approved internally')).toBeInTheDocument()
    expect(screen.getByText(/Applying and releasing remain separate actions/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve candidate' })).toBeDisabled()
  })
})
