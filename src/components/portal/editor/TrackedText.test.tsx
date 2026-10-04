import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TrackedText from './TrackedText'

describe('TrackedText', () => {
  it('shows added words highlighted and removed words struck through, without Markdown', () => {
    const { container } = render(<TrackedText base="Paid **before** anyone is hired." current="Paid **before** anyone is hired, never after." />)
    expect(container.querySelector('ins')).toHaveTextContent('added: hired, never after.')
    expect(container.querySelector('del')).toHaveTextContent('removed: hired.')
    expect(container.textContent).not.toContain('**')
  })
})
