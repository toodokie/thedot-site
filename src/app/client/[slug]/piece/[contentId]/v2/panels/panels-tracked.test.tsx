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
