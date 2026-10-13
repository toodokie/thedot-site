import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { PageProviders, renderInPage, stubDialogs } from '../test-utils'
import ChaptersForm from './ChaptersForm'
import SearchForm from './SearchForm'

const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?\n\nOutro.'
const descriptionTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-description', label: 'YouTube description', currentText: DESCRIPTION }
const SEO = '- **SEO title:** How to Choose a Representative in Canada\n- **Slug:** `/news/how-to-choose`\n- **Meta description:** A license tells you who may help you.\n- **Category:** News'
const seoTarget: ReviewTarget = { kind: 'copy_block', key: 'article-seo', label: 'SEO', currentText: SEO }

function DraftProbe({ of }: { of: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(of)?.proposedText ?? ''}</output>
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('ChaptersForm', () => {
  const block = { key: 'youtube-description', label: 'YouTube description', body: DESCRIPTION }

  it('edits one chapter title and changes only that line', async () => {
    renderInPage(<><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /><DraftProbe of={descriptionTarget} /></>)
    fireEvent.change(screen.getByLabelText('Title, chapter 2'), { target: { value: 'Bring questions?' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(DESCRIPTION.replace('Should a client bring questions?', 'Bring questions?')))
  })

  it('adds a chapter once its time and title are filled', async () => {
    renderInPage(<><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /><DraftProbe of={descriptionTarget} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Add a chapter' }))
    fireEvent.change(screen.getByLabelText('Time, chapter 3'), { target: { value: '03:43' } })
    expect(screen.getByTestId('draft').textContent).toBe('')
    fireEvent.change(screen.getByLabelText('Title, chapter 3'), { target: { value: 'How many people work on a case?' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toContain('01:31 Should a client bring questions?\n03:43 How many people work on a case?\n\nOutro.'))
  })

  it('marks a time that is not minutes and seconds', () => {
    renderInPage(<ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} />)
    fireEvent.change(screen.getByLabelText('Time, chapter 1'), { target: { value: '0 0' } })
    expect(screen.getByLabelText('Time, chapter 1')).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps a chapter row she has not finished when the editor closes and opens again', () => {
    const view = renderInPage(<ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a chapter' }))
    fireEvent.change(screen.getByLabelText('Title, chapter 3'), { target: { value: 'No time yet' } })
    view.rerender(<PageProviders><p>closed</p></PageProviders>)
    expect(screen.queryByLabelText('Title, chapter 3')).not.toBeInTheDocument()
    view.rerender(<PageProviders><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /></PageProviders>)
    expect(screen.getByLabelText('Title, chapter 3')).toHaveValue('No time yet')
    expect(screen.getByText('Chapter 3 saves once it has a time like 12:30 and a title.')).toBeInTheDocument()
  })

  it('says plainly when YouTube would not show the chapters, and still saves them', async () => {
    renderInPage(<><ChaptersForm target={descriptionTarget} block={block} source={DESCRIPTION} /><DraftProbe of={descriptionTarget} /></>)
    expect(screen.getByText('YouTube shows chapters only when there are at least three.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a chapter' }))
    fireEvent.change(screen.getByLabelText('Time, chapter 3'), { target: { value: '01:00' } })
    fireEvent.change(screen.getByLabelText('Title, chapter 3'), { target: { value: 'Too early' } })
    fireEvent.change(screen.getByLabelText('Time, chapter 1'), { target: { value: '00:05' } })
    expect(screen.queryByText('YouTube shows chapters only when there are at least three.')).not.toBeInTheDocument()
    expect(screen.getByText('YouTube shows chapters only when the first one starts at 0:00.')).toBeInTheDocument()
    expect(screen.getByText('YouTube shows chapters only when each one starts later than the one before.')).toBeInTheDocument()
    expect(screen.getByText('Your list is saved as you wrote it.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('draft').textContent)
      .toBe(DESCRIPTION.replace('00:00 Meet', '00:05 Meet').replace('questions?\n\nOutro.', 'questions?\n01:00 Too early\n\nOutro.')))
  })

  it('edits chapters inside a YouTube package and leaves the rest of the block alone', async () => {
    const pkgBody = `**Title:** Episode 4\n\n**Description:**\n${DESCRIPTION}\n\n**Tags:** a,b`
    const pkgTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-package', label: 'YouTube', currentText: pkgBody }
    renderInPage(<><ChaptersForm target={pkgTarget} block={{ key: 'youtube-package', label: 'YouTube', body: pkgBody }} source={pkgBody} /><DraftProbe of={pkgTarget} /></>)
    fireEvent.change(screen.getByLabelText('Title, chapter 1'), { target: { value: 'Meet the hosts' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(pkgBody.replace('Meet Maria and Mary', 'Meet the hosts')))
  })
})

describe('SearchForm', () => {
  it('keeps a value it cannot write back as she typed it, and shows it again on reopen', () => {
    const view = renderInPage(<SearchForm target={seoTarget} source={SEO} />)
    fireEvent.change(screen.getByLabelText('Search title'), { target: { value: '`draft`' } })
    expect(screen.getByRole('alert')).toHaveTextContent('This cannot be a single word in backticks.')
    view.rerender(<PageProviders><p>closed</p></PageProviders>)
    view.rerender(<PageProviders><SearchForm target={seoTarget} source={SEO} /></PageProviders>)
    expect(screen.getByLabelText('Search title')).toHaveValue('`draft`')
    expect(screen.getByRole('alert')).toHaveTextContent('This cannot be a single word in backticks.')
  })

  it('edits the search title with a counter and keeps every other line', async () => {
    renderInPage(<><SearchForm target={seoTarget} source={SEO} /><DraftProbe of={seoTarget} /></>)
    expect(screen.getByText('40 of 60 characters')).toBeInTheDocument()
    expect(screen.getByText('37 of 160 characters')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search title'), { target: { value: 'Choosing an Immigration Representative' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent)
      .toBe(SEO.replace('How to Choose a Representative in Canada', 'Choosing an Immigration Representative')))
    expect(screen.getByLabelText('Web address')).toHaveValue('/news/how-to-choose')
  })

  it('keeps the web address in its code ticks', async () => {
    renderInPage(<><SearchForm target={seoTarget} source={SEO} /><DraftProbe of={seoTarget} /></>)
    fireEvent.change(screen.getByLabelText('Web address'), { target: { value: '/news/choose' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(SEO.replace('`/news/how-to-choose`', '`/news/choose`')))
  })
})
