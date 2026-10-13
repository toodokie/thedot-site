import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { renderInPage, replaceEditorText, stubDialogs } from '../test-utils'
import TagChips from './TagChips'
import { TagsBlockForm, TitleBlockForm, YouTubePackageForm } from './YouTubeForms'

const PACKAGE = '**Title:** What does a permit cost?\n\n**Description:**\nThree things to know.\n\n**Tags:** LMIA, LMIA cost, foreign worker\n\n**Note for Maria on the title:** kept short.'
const target: ReviewTarget = { kind: 'copy_block', key: 'youtube-package', label: 'YouTube Short', currentText: PACKAGE }

function DraftProbe({ of }: { of: ReviewTarget }) {
  const { readDraft } = useReviewDrafts()
  return <output data-testid="draft">{readDraft(of)?.proposedText ?? ''}</output>
}

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('YouTubePackageForm', () => {
  it('edits the title as one line and keeps every other character of the block', async () => {
    renderInPage(<><YouTubePackageForm target={target} source={PACKAGE} base={PACKAGE} /><DraftProbe of={target} /></>)
    const title = screen.getByLabelText('Title')
    expect(title).toHaveValue('What does a permit cost?')
    expect(screen.getByText('24 of 100 characters')).toBeInTheDocument()
    fireEvent.change(title, { target: { value: 'What a permit costs in Ontario' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('What does a permit cost?', 'What a permit costs in Ontario')))
  })

  it('edits the description on its own, with a 5,000 counter, and keeps the title and tags bytes', async () => {
    renderInPage(<><YouTubePackageForm target={target} source={PACKAGE} base={PACKAGE} /><DraftProbe of={target} /></>)
    expect(screen.getByText('21 of 5,000 characters')).toBeInTheDocument()
    replaceEditorText('Description', 'Four things to know.')
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('Three things', 'Four things')))
    expect(screen.getByText('20 of 5,000 characters')).toBeInTheDocument()
  })

  it('removes a tag, shows it struck through, and putting it back restores the block', async () => {
    renderInPage(<><YouTubePackageForm target={target} source={PACKAGE} base={PACKAGE} /><DraftProbe of={target} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag LMIA cost' }))
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(PACKAGE.replace('LMIA, LMIA cost, foreign worker', 'LMIA, foreign worker')))
    expect(screen.getByText('Removed:', { exact: false })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Put back tag LMIA cost' }))
    // Put back returns the tag to where it was, so the block is the released text again: no draft.
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(''))
  })

  it('keeps the original tag separators when a tag changes', async () => {
    const tight = PACKAGE.replace('LMIA, LMIA cost, foreign worker', 'LMIA,LMIA cost,foreign worker')
    const tightTarget: ReviewTarget = { ...target, currentText: tight }
    renderInPage(<><YouTubePackageForm target={tightTarget} source={tight} base={tight} /><DraftProbe of={tightTarget} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag LMIA cost' }))
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe(tight.replace('LMIA,LMIA cost,foreign worker', 'LMIA,foreign worker')))
  })
})

describe('TagChips', () => {
  it('adds tags with Enter or a comma and marks them added', () => {
    const onChange = vi.fn()
    renderInPage(<TagChips id="t" tags={['LMIA']} baseTags={['LMIA']} onChange={onChange} />)
    const input = screen.getByLabelText('Add a tag')
    fireEvent.change(input, { target: { value: 'Ontario' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['LMIA', 'Ontario'])
    fireEvent.change(input, { target: { value: 'Toronto,' } })
    expect(onChange).toHaveBeenLastCalledWith(['LMIA', 'Toronto'])
  })
})

describe('separate episode blocks', () => {
  it('edits a title block and a tags block on their own', async () => {
    const titleTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-title', label: 'YouTube title', currentText: 'Old title' }
    const tagsTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-tags', label: 'YouTube tags', currentText: 'a, b' }
    renderInPage(<>
      <TitleBlockForm target={titleTarget} source="Old title" />
      <TagsBlockForm target={tagsTarget} source="a, b" base="a, b" />
      <DraftProbe of={titleTarget} />
    </>)
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe('New title'))
    expect(screen.getAllByRole('listitem').map((li) => li.textContent?.replace('×', ''))).toEqual(['a', 'b'])
  })

  it('edits only the title line of a title block and keeps the note byte for byte (item 4)', async () => {
    const body = 'Old title\n\n*Kept short on purpose.*'
    const titleTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-title', label: 'YouTube title', currentText: body }
    renderInPage(<><TitleBlockForm target={titleTarget} source={body} /><DraftProbe of={titleTarget} /></>)
    expect(screen.getByLabelText('Title')).toHaveValue('Old title')
    expect(screen.getByText('9 of 100 characters')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New title' } })
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe('New title\n\n*Kept short on purpose.*'))
  })

  it('keeps newline-separated tags on their own lines', async () => {
    const tagsTarget: ReviewTarget = { kind: 'copy_block', key: 'youtube-tags', label: 'YouTube tags', currentText: 'a\nb\nc' }
    renderInPage(<><TagsBlockForm target={tagsTarget} source={'a\nb\nc'} base={'a\nb\nc'} /><DraftProbe of={tagsTarget} /></>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag b' }))
    await waitFor(() => expect(screen.getByTestId('draft').textContent).toBe('a\nc'))
  })
})
