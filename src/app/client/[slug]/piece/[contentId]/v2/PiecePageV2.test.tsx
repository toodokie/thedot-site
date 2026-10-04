import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('./derive', () => ({ deriveWorkspaceData: vi.fn(() => ({ version: 2 })) }))
vi.mock('./PieceWorkspace', () => ({ default: function PieceWorkspace() { return <main>workspace</main> } }))
vi.mock('../FeedbackCard', () => ({
  default: function FeedbackCard({ slug, contentItemId }: { slug: string; contentItemId: string | null }) {
    return <aside data-testid="feedback-card">{slug}:{contentItemId}</aside>
  },
}))

import PiecePageV2, { type PiecePageV2Props } from './PiecePageV2'

function props(overrides: Partial<PiecePageV2Props>): PiecePageV2Props {
  return { mode: 'client', slug: 'kanset', draftScope: 'u1', serverDrafts: null, ticks: [], ...overrides } as PiecePageV2Props
}

describe('PiecePageV2 feedback card mount (plan 5 Task 14)', () => {
  it('mounts the card on the client seat when the page offers it', () => {
    render(<PiecePageV2 {...props({ feedback: { contentItemId: 'item-1' } })} />)
    expect(screen.getByTestId('feedback-card')).toHaveTextContent('kanset:item-1')
  })

  it('mounts nothing when the page does not offer it', () => {
    render(<PiecePageV2 {...props({ feedback: null })} />)
    expect(screen.queryByTestId('feedback-card')).not.toBeInTheDocument()
  })

  it.each(['preview', 'agency'] as const)('never mounts it in %s mode, so nothing there can submit', (mode) => {
    render(<PiecePageV2 {...props({ mode, feedback: { contentItemId: 'item-1' } })} />)
    expect(screen.getByText('workspace')).toBeInTheDocument()
    expect(screen.queryByTestId('feedback-card')).not.toBeInTheDocument()
  })
})
