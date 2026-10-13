import { act, fireEvent, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/app/client/[slug]/draft-actions', () => ({ saveReviewDraft: vi.fn(), discardReviewDraft: vi.fn(), sendReviewDrafts: vi.fn(), reportReviewSendFailure: vi.fn() }))
vi.mock('@/app/client/[slug]/request-actions', () => ({ sendReviewBundle: vi.fn(), acknowledgePiecePageIntro: vi.fn(), requestContentRemoval: vi.fn() }))
vi.mock('@/app/client/[slug]/tick-actions', () => ({ tickReviewTabs: vi.fn(async () => ({ ok: true })) }))

import type { CopyTab } from '@/lib/portal/piece-page/copy-tabs'
import { useReviewDrafts, type ReviewTarget } from '../../ReviewDraftProvider'
import { renderInPage, stubDialogs } from '../test-utils'
import ArticlePanel from './ArticlePanel'
import CopyPanel from './CopyPanel'
import OnScreenTextPanel from './OnScreenTextPanel'
import YouTubePanel from './YouTubePanel'

function Save({ target, text }: { target: ReviewTarget; text: string }) {
  const { saveDraft } = useReviewDrafts()
  return <button type="button" onClick={() => saveDraft(target, text, null)}>save draft</button>
}

const CAPTION = 'First paragraph.\n\nSecond paragraph.'
const caption: CopyTab = { key: 'caption', kind: 'caption', label: 'Caption', blocks: [{ key: 'social-caption', label: 'Caption', body: CAPTION }] }
const SCRIPT = '**1.** FOR EMPLOYERS\n\n**2.** $1,000 PER POSITION'
const onscreen: CopyTab = { key: 'onscreen', kind: 'onscreen', label: 'On-screen text', blocks: [{ key: 'reel-script', label: 'Reel', body: SCRIPT }] }
const ARTICLE = '# Title\n\nOpening.\n\n### Start here\n\nSection body.\n\n### Sources\n\nA source.'
const article: CopyTab = { key: 'article', kind: 'article', label: 'Article', blocks: [{ key: 'article-body', label: 'Article', body: ARTICLE }] }

beforeEach(() => { stubDialogs(); window.localStorage.clear() })

describe('unsent edits read as tracked changes', () => {
  it('in a caption', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'social-caption', label: 'Caption', currentText: CAPTION }} text={'First paragraph.\n\nSecond paragraph, changed.'} />
      <CopyPanel tab={caption} before={{}} canEdit version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    expect(document.querySelector('ins')).toHaveTextContent('paragraph, changed.')
    expect(document.querySelector('del')).toHaveTextContent('paragraph.')
  })

  it('in the edited frame only', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'reel-script', label: 'Reel', currentText: SCRIPT }} text={SCRIPT.replace('PER POSITION', 'PER JOB')} />
      <OnScreenTextPanel tab={onscreen} frames={[]} before={{}} canEdit onSuggestFrame={null} version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].querySelector('ins')).toBeNull()
    expect(rows[1].querySelector('ins')).toHaveTextContent('JOB')
    expect(rows[1].querySelector('del')).toHaveTextContent('POSITION')
  })
})

describe('Jump to my edits', () => {
  it('lists every changed section and links to it', () => {
    renderInPage(<>
      <Save target={{ kind: 'copy_block', key: 'article-body', label: 'Article', currentText: ARTICLE }} text={ARTICLE.replace('Section body.', 'Section body, edited.')} />
      <ArticlePanel tab={article} coverUrl={null} before={{}} canEdit version={2} />
    </>)
    act(() => fireEvent.click(screen.getByRole('button', { name: 'save draft' })))
    fireEvent.click(screen.getByRole('button', { name: 'Jump to my edits (1)' }))
    expect(screen.getByRole('link', { name: 'Start here' })).toHaveAttribute('href', '#article-section-1')
  })
})

describe('YouTube read view marks what changed since the previous version', () => {
  const NOW = '**Title:** New title\n\n**Description:** Same description.\n\n**Tags:** visa, work permit'
  const youtube: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [{ key: 'youtube-package', label: 'YouTube Short', body: NOW }] }

  it('highlights a changed title and tags, and leaves an unchanged description plain', () => {
    const before = { 'youtube-package': '**Title:** Old title\n\n**Description:** Same description.\n\n**Tags:** visa' }
    renderInPage(<YouTubePanel tab={youtube} before={before} canEdit={false} version={2} />)
    const changed = [...document.querySelectorAll('[data-changed="true"]')].map((el) => el.textContent)
    expect(changed.some((text) => text?.includes('New title'))).toBe(true)
    expect(changed.some((text) => text?.includes('work permit'))).toBe(true)
    expect(changed.some((text) => text?.includes('Same description.'))).toBe(false)
  })

  it('highlights nothing when there is no previous version', () => {
    renderInPage(<YouTubePanel tab={youtube} before={{}} canEdit={false} version={2} />)
    expect(document.querySelector('[data-changed="true"]')).toBeNull()
  })

  it('highlights separate title and tags blocks', () => {
    const split: CopyTab = { key: 'youtube', kind: 'youtube', label: 'YouTube', blocks: [
      { key: 'youtube-title', label: 'Title', body: 'New title' },
      { key: 'youtube-tags', label: 'Tags', body: 'visa, work permit' },
    ] }
    renderInPage(<YouTubePanel tab={split} before={{ 'youtube-title': 'Old title', 'youtube-tags': 'visa, work permit' }} canEdit={false} version={2} />)
    const changed = [...document.querySelectorAll('[data-changed="true"]')].map((el) => el.textContent)
    expect(changed).toHaveLength(1)
    expect(changed[0]).toContain('New title')
  })
})
