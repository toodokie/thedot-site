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

  it('keeps the number an ordered list starts at', () => {
    const { container } = render(<MarkdownCopy body={'3. Book a consultation\n4. Bring your documents'} />)
    expect(container.querySelector('ol')).toHaveAttribute('start', '3')
  })

  it('opens only https links, in a new tab with no opener and no referrer', () => {
    const { container } = render(<MarkdownCopy body={'[Book](https://kanset.com/contact) and [bad](javascript:alert(1)) and <img src=x onerror=alert(1)>'} />)
    const links = container.querySelectorAll('a')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://kanset.com/contact')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(container.querySelector('img')).toBeNull()
  })

  it('creates clean clipboard text while preserving hashtags', () => {
    expect(plainTextFromMarkdown('### Slide 7\n\n**Records**\n\n- [ ] Permit\n\n#LMIA'))
      .toBe('Slide 7\n\nRecords\n☐ Permit\n\n#LMIA')
  })
})
