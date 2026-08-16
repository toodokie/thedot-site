import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import IdeaDecisionForm from './IdeaDecisionForm'

vi.mock('./idea-decision-actions', () => ({ decideIdea: vi.fn(async () => ({})) }))

describe('IdeaDecisionForm', () => {
  it('submits the database item UUID and stable content id separately', () => {
    const { container } = render(
      <IdeaDecisionForm
        slug="kanset"
        contentItemId="11111111-1111-1111-1111-111111111111"
        contentId="kanset-2026-08-fri-individual"
        planCycleId="22222222-2222-2222-2222-222222222222"
        revision={1}
      />,
    )

    expect(container.querySelector('input[name="contentItemId"]'))
      .toHaveValue('11111111-1111-1111-1111-111111111111')
    expect(container.querySelector('input[name="contentId"]'))
      .toHaveValue('kanset-2026-08-fri-individual')
  })
})
