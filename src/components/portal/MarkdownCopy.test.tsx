import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownCopy, { plainTextFromMarkdown } from './MarkdownCopy'

describe('MarkdownCopy', () => {
  it('renders headings, emphasis and lists without exposing markdown markers', () => {
    const { container } = render(<MarkdownCopy body={`### Slide 7: Prepare the approved employment records

**PREPARE THE APPROVED EMPLOYMENT RECORDS**

- Positive LMIA decision letter and annexes
- [ ] Employee's work permit

#CanadianEmployers`} />)

    expect(screen.getByRole('heading', { name: 'Slide 7: Prepare the approved employment records' })).toBeTruthy()
    expect(screen.getByText('PREPARE THE APPROVED EMPLOYMENT RECORDS').tagName).toBe('STRONG')
    expect(screen.getByText("☐ Employee's work permit")).toBeTruthy()
    expect(container.textContent).not.toContain('###')
    expect(container.textContent).not.toContain('**')
    expect(container.textContent).toContain('#CanadianEmployers')
  })

  it('creates clean clipboard text while preserving hashtags', () => {
    expect(plainTextFromMarkdown('### Slide 7\n\n**Records**\n\n- [ ] Permit\n\n#LMIA'))
      .toBe('Slide 7\n\nRecords\n☐ Permit\n\n#LMIA')
  })
})
