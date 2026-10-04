import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { editorMarkdown, renderInPage, replaceEditorText, stubDialogs } from '../test-utils'
import YouTubePanel from './YouTubePanel'
import ChaptersPanel from './ChaptersPanel'
import ArticlePanel from './ArticlePanel'
import SearchSharingPanel from './SearchSharingPanel'
import CoverImagePanel from './CoverImagePanel'

const PACKAGE = '**Title:** What does a permit cost?\n\n**Description:**\nThree things to know.\n\n**Tags:** LMIA, LMIA cost, foreign worker'
const youtube: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [{ key: 'youtube-package', label: 'YouTube Short package', body: PACKAGE }] }
const DESCRIPTION = 'Intro.\n\nChapters:\n00:00 Meet Maria and Mary\n01:31 Should a client bring questions?'
const episode: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [
  { key: 'youtube-title', label: 'YouTube title', body: 'How to Choose an Immigration Consultant' },
  { key: 'youtube-description', label: 'YouTube description', body: DESCRIPTION },
  { key: 'youtube-tags', label: 'YouTube tags', body: 'canada immigration, RCIC' },
] }
const chapters: CopyTab = { key: 'chapters', kind: 'chapters', label: 'Chapters', blocks: [episode.blocks[1]] }
const ARTICLE = '# How to Choose a Representative\n\nOpening paragraph.\n\n### Start with the one thing you can check\n\nSection body.'
const article: CopyTab = { key: 'article', kind: 'article', label: 'Article', blocks: [{ key: 'article-body', label: 'Article', body: ARTICLE }] }
const SEO = '- **SEO title:** How to Choose a Representative in Canada\n- **Slug:** `/news/how-to-choose`\n- **Meta description:** A license tells you who may help you.\n- **Category:** News'
const seo: CopyTab = { key: 'seo', kind: 'seo', label: 'Search & sharing', blocks: [{ key: 'article-seo', label: 'SEO and publishing details', body: SEO }] }

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('YouTubePanel', () => {
  it('shows Title, Description and Tags as fields, never the label markup', () => {
    renderInPage(<YouTubePanel tab={youtube} before={{}} canEdit version={2} />)
    expect(screen.getByText('What does a permit cost?')).toBeInTheDocument()
    expect(screen.getByText('Three things to know.')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Tags' })).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['LMIA', 'LMIA cost', 'foreign worker'])
    expect(document.body.textContent).not.toContain('**Title')
    fireEvent.click(screen.getByRole('button', { name: 'Edit YouTube Short package' }))
    expect(screen.getByLabelText('Text')).toHaveValue(PACKAGE)
  })

  it('shows separate episode blocks as the same three fields', () => {
    renderInPage(<YouTubePanel tab={episode} before={{}} canEdit={false} version={2} />)
    expect(screen.getByText('How to Choose an Immigration Consultant')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['canada immigration', 'RCIC'])
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
  })
})

describe('ChaptersPanel', () => {
  it('lists chapter times and titles from the description', () => {
    renderInPage(<ChaptersPanel tab={chapters} canEdit version={2} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[1]).getByText('01:31')).toBeInTheDocument()
    expect(within(items[1]).getByText('Should a client bring questions?')).toBeInTheDocument()
  })
})

describe('ArticlePanel', () => {
  it('reads like the article with the headline, the opening and each section editable', () => {
    renderInPage(<ArticlePanel tab={article} coverUrl={null} before={{}} canEdit version={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'How to Choose a Representative' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Start with the one thing you can check' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('###')
    fireEvent.click(screen.getByRole('button', { name: 'Edit section, Start with the one thing you can check' }))
    expect(screen.getByRole('textbox', { name: 'Start with the one thing you can check · Article' }))
      .toHaveTextContent(/Start with the one thing you can check\s*Section body\./)
  })

  it('opens a section on her unsent draft and keeps her other section edits', () => {
    renderInPage(<ArticlePanel tab={article} coverUrl={null} before={{}} canEdit version={2} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit section, Opening' }))
    replaceEditorText('Opening · Article', '# How to Choose a Representative\n\nA new opening.')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit section, Start with the one thing you can check' }))
    replaceEditorText('Start with the one thing you can check · Article', '### Start with the one thing you can check\n\nA new body.')
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText('A new opening.')).toBeInTheDocument()
    expect(screen.getByText('A new body.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit section, Opening' }))
    expect(editorMarkdown('Opening · Article')).toBe('# How to Choose a Representative\n\nA new opening.')
  })

  it('highlights a changed paragraph inside a section', () => {
    renderInPage(<ArticlePanel tab={article} coverUrl={null} before={{ 'article-body': ARTICLE.replace('Section body.', 'Old body.') }} canEdit version={2} />)
    const changed = document.querySelectorAll('[data-changed="true"]')
    expect(changed).toHaveLength(1)
    expect(changed[0]).toHaveTextContent('Section body.')
  })
})

describe('SearchSharingPanel', () => {
  it('previews the search result and counts the search fields', () => {
    renderInPage(<SearchSharingPanel tab={seo} canEdit version={2} />)
    const serp = screen.getByRole('group', { name: 'How it looks in Google' })
    expect(serp).toHaveTextContent('kanset.com/news/how-to-choose')
    expect(serp).toHaveTextContent('How to Choose a Representative in Canada')
    expect(screen.getByText('40 of 60 characters')).toBeInTheDocument()
    expect(screen.getByText('Web address')).toBeInTheDocument()
    expect(screen.getByText('Category')).toBeInTheDocument()
  })
})

describe('CoverImagePanel', () => {
  it('shows the cover, opens it in Drive and takes a visual note', () => {
    const onSuggest = vi.fn()
    renderInPage(<CoverImagePanel cover={{ label: 'Website cover', url: 'https://drive.google.com/c', previewUrl: 'https://signed.example/c.jpg', width: 1500, height: 1000 }} onSuggest={onSuggest} />)
    expect(screen.getByRole('img', { name: 'Website cover' })).toHaveAttribute('src', 'https://signed.example/c.jpg')
    expect(screen.getByRole('link', { name: 'Open the cover in Drive' })).toHaveAttribute('href', 'https://drive.google.com/c')
    expect(screen.getByRole('link', { name: 'Open the cover in Drive' })).toHaveAttribute('rel', 'noopener noreferrer')
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a change' }))
    expect(onSuggest).toHaveBeenCalled()
  })
})
