import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReadOnlyPreview from './ReadOnlyPreview'

describe('ReadOnlyPreview', () => {
  it('shows the Maria preview boundary and blocks nested submissions', () => {
    const submitted = vi.fn()
    render(
      <ReadOnlyPreview>
        <form onSubmit={submitted}>
          <label htmlFor="copy">Suggested replacement copy</label>
          <textarea id="copy" defaultValue="Maria rewrite" />
          <button type="submit">Send suggestion</button>
        </form>
      </ReadOnlyPreview>,
    )

    expect(screen.getByText(/Viewing as Maria, read-only/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send suggestion' }))
    expect(submitted).not.toHaveBeenCalled()
    expect(screen.getByText('Read-only preview: nothing was submitted.')).toBeInTheDocument()
  })
})
