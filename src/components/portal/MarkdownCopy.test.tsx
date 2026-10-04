import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MarkdownCopy, { plainTextFromMarkdown } from './MarkdownCopy'
import { ARTICLE_SOURCES, REEL_SCRIPT, YOUTUBE_PACKAGE } from './__fixtures__/canonical-copy'

// The text the current piece page showed for these real bodies before stray markers were kept.
const RENDERED = {
  REEL_SCRIPT: "Frame 1Canada immigrationMonday roundupAug 17Frame 2How long is the wait right now?Small line: Fresh official numbers from IRCC and Service Canada.Frame 3Permanent residence estimatesFederal Skilled WorkerAbout 6 months ↓Canadian Experience Class6 months ↔Small line: IRCC refresh of Aug 10. Arrows compare with July 7 estimates.",
  ARTICLE_SOURCES: "Before spending months preparing an application around an assumption, book a consultation with Kanset Immigration Services to review your circumstances and compare the available routes.Official sourcesHumanitarian and compassionate grounds (canada.ca)Guide 5291, Humanitarian and Compassionate Considerations (canada.ca)Sponsor your spouse, partner or child, complete guide (canada.ca)Open work permit for a sponsored spouse or partner in Canada (canada.ca)This article provides general information only and is not legal advice. Immigration rules can change, and every case turns on its own facts.",
  YOUTUBE_PACKAGE: "Title: Canada immigration Monday roundup, Aug 17Description:Canada immigration news for Aug 17: IRCC's August 10 permanent residence and citizenship wait-times refresh, the 418-day estimate for extending visitor status in Canada, July's LMIA averages, a quiet week for Express Entry and Ontario's Workforce Priority status.Official IRCC processing times tool: https://www.canada.ca/en/immigration-refugees-citizenship/services/application/check-processing-times.htmlOfficial LMIA processing times: https://www.canada.ca/en/employment-social-development/services/foreign-workers/labour-market-impact-assessment-processing-times.htmlOfficial Express Entry rounds: https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/submit-profile/rounds-invitations.htmlGeneral information only. Immigration rules change, and every case turns on its own facts.#CanadaImmigration #LMIA #CanadianCitizenship #KansetServices"
} as const

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

  it('renders ordinary canonical copy exactly as before', () => {
    const bodies = { REEL_SCRIPT, ARTICLE_SOURCES, YOUTUBE_PACKAGE }
    for (const [name, body] of Object.entries(bodies)) {
      const { container, unmount } = render(<MarkdownCopy body={body} />)
      expect(container.textContent, name).toBe(RENDERED[name as keyof typeof RENDERED])
      unmount()
    }
    const { container } = render(<MarkdownCopy body={ARTICLE_SOURCES} />)
    expect(container.querySelector('em')).toHaveTextContent(/^This article provides general information only/)
  })

  it('keeps a stray asterisk or underscore that is not emphasis', () => {
    const cases: Array<[string, string]> = [
      ["Small line: *All figures rounded from IRCC's published example.", "Small line: *All figures rounded from IRCC's published example."],
      ['5 * 3 * 2 = 30', '5 * 3 * 2 = 30'],
      ['Footnote*', 'Footnote*'],
      ['file_name_here and snake_case', 'file_name_here and snake_case'],
      ['a _ b _ c', 'a _ b _ c'],
      ['**Bold** and *italic* and _also_', 'Bold and italic and also'],
      ['***both***', 'both'],
    ]
    for (const [body, text] of cases) {
      const { container, unmount } = render(<MarkdownCopy body={body} />)
      expect(container.textContent, body).toBe(text)
      unmount()
    }
  })

  it('copies the same characters the page shows, stripping only real emphasis', () => {
    const cases: Array<[string, string]> = [
      ["Small line: *All figures rounded from IRCC's published example.", "Small line: *All figures rounded from IRCC's published example."],
      ['5 * 3 * 2 = 30', '5 * 3 * 2 = 30'],
      ['Footnote*', 'Footnote*'],
      ['Saved under drive_fs and agency_attested', 'Saved under drive_fs and agency_attested'],
      ['file_name_here and snake_case', 'file_name_here and snake_case'],
      ['a _ b _ c', 'a _ b _ c'],
      ['**Bold** and *italic* and _also_', 'Bold and italic and also'],
      ['***both***', 'both'],
      ['Run `drive_fs` and [Book](https://kanset.com/contact)', 'Run drive_fs and Book (https://kanset.com/contact)'],
    ]
    for (const [body, text] of cases) {
      expect(plainTextFromMarkdown(body), body).toBe(text)
      const { container, unmount } = render(<MarkdownCopy body={body.replace(/\[Book\]\(https:\/\/kanset\.com\/contact\)/, 'Book (https://kanset.com/contact)')} />)
      expect(container.textContent, body).toBe(text)
      unmount()
    }
  })

  it('creates clean clipboard text while preserving hashtags', () => {
    expect(plainTextFromMarkdown('### Slide 7\n\n**Records**\n\n- [ ] Permit\n\n#LMIA'))
      .toBe('Slide 7\n\nRecords\n☐ Permit\n\n#LMIA')
  })
})
