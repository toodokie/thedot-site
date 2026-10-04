import { describe, expect, it } from 'vitest'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { blockTabKind, buildCopyTabs, pieceLayout, primaryPreview } from './copy-tabs'

const block = (key: string | null, label = 'Label', body = 'Body') => ({ key, label, body })
const preview = (overrides: Partial<SignedReviewPreview>): SignedReviewPreview => ({
  id: 'p', contentItemId: 'i', contentVersion: 1, previewKey: 'reel', mediaKind: 'video', width: 1080, height: 1920,
  durationSeconds: 30, videoUrl: 'https://x/v.mp4', posterUrl: null, frames: [], expiresAt: '2026-10-03T00:10:00Z',
  ...overrides,
})
const asset = (asset_key: string, channel: ReviewAsset['channel'], asset_kind: ReviewAsset['asset_kind']): ReviewAsset => ({
  id: asset_key, content_version: 1, asset_key, label: asset_key, channel, asset_kind, url: 'https://drive.google.com/x',
  width_px: 1500, height_px: 1000, caption_status: 'not_applicable', review_note: null,
})

describe('pieceLayout', () => {
  it('reads the layout from the format first', () => {
    expect(pieceLayout('reel', [block('social-caption')], [])).toBe('vertical')
    expect(pieceLayout('podcast', [block('youtube-title')], [preview({ width: 1080, height: 1920 })])).toBe('horizontal')
    expect(pieceLayout('linkedin-post', [block('linkedin-caption')], [])).toBe('pages')
    expect(pieceLayout('podcast_article', [block('article-body')], [])).toBe('article')
  })

  it('falls back to previews, then blocks', () => {
    expect(pieceLayout('test', [block('caption')], [preview({ width: 1920, height: 1080 })])).toBe('horizontal')
    expect(pieceLayout('test', [block('caption')], [preview({ mediaKind: 'pages', videoUrl: null })])).toBe('pages')
    expect(pieceLayout(null, [block('reel-script')], [])).toBe('vertical')
    expect(pieceLayout(null, [block('caption')], [])).toBe('text')
  })

  it('needs an article body for the article layout', () => {
    expect(pieceLayout('article', [block('summary')], [])).toBe('text')
  })
})

describe('primaryPreview', () => {
  it('prefers a horizontal video for a horizontal layout', () => {
    const tall = preview({ id: 'tall' })
    const wide = preview({ id: 'wide', width: 1920, height: 1080 })
    expect(primaryPreview('horizontal', [tall, wide])?.id).toBe('wide')
    expect(primaryPreview('vertical', [wide, tall])?.id).toBe('tall')
    expect(primaryPreview('article', [preview({ id: 'cover', previewKey: 'website-cover', mediaKind: 'pages' })])?.id).toBe('cover')
  })
})

describe('buildCopyTabs', () => {
  it('orders a reel as On-screen text, Caption, YouTube', () => {
    const tabs = buildCopyTabs('vertical', [block('youtube-package'), block('social-caption'), block('reel-script')], [])
    expect(tabs.map((tab) => [tab.key, tab.label])).toEqual([
      ['onscreen', 'On-screen text'], ['caption', 'Caption'], ['youtube', 'YouTube'],
    ])
  })

  it('adds Chapters for an episode whose description carries chapters', () => {
    const description = block('youtube-description', 'YouTube description', 'Intro\n\n00:00 Hello\n01:00 Next')
    const tabs = buildCopyTabs('horizontal', [block('youtube-title'), description, block('ig-facebook-caption')], [])
    expect(tabs.map((tab) => tab.label)).toEqual(['YouTube', 'Caption', 'Chapters'])
    expect(tabs[2].blocks).toEqual([description])
  })

  it('names a LinkedIn document PDF text, with Post and First comment', () => {
    const tabs = buildCopyTabs('pages', [block('linkedin-caption'), block('linkedin-first-comment'), block('linkedin-document-copy')], [])
    expect(tabs.map((tab) => tab.label)).toEqual(['PDF text', 'Post', 'First comment'])
  })

  it('gives an article Article, Search & sharing and Cover image', () => {
    const tabs = buildCopyTabs('article', [block('article-seo'), block('article-body')], [asset('website-cover', 'website', 'cover')])
    expect(tabs.map((tab) => tab.label)).toEqual(['Article', 'Search & sharing', 'Cover image'])
  })

  it('never drops a block and keeps keys valid tick keys', () => {
    const blocks = [block('story', 'Story'), block('summary', 'Summary'), block(null, 'Caption'),
      block('a'.repeat(64), 'Long key'), block('reel-script'), block('ig-caption'), block('fb-caption')]
    const tabs = buildCopyTabs('vertical', blocks, [])
    const placed = tabs.flatMap((tab) => tab.blocks)
    for (const b of blocks) expect(placed).toContain(b)
    for (const tab of tabs) expect(tab.key).toMatch(/^[a-z0-9][a-z0-9:_-]{0,63}$/)
    expect(tabs.find((tab) => tab.key === 'caption')?.blocks.map((b) => b.key)).toEqual([null, 'ig-caption', 'fb-caption'])
  })

  it('classifies blocks by key and label', () => {
    expect(blockTabKind(block('onscreen-script'))).toBe('onscreen')
    expect(blockTabKind(block('x', 'On-screen copy'))).toBe('onscreen')
    expect(blockTabKind(block('carousel-slides'))).toBe('document')
    expect(blockTabKind(block('youtube-short'))).toBe('youtube')
  })
})

describe('buildCopyTabs coverage', () => {
  it('places a block whose tab the layout does not list', () => {
    const body = block('article-body', 'Body')
    const tabs = buildCopyTabs('vertical', [body, block('article-seo', 'SEO')], [])
    expect(tabs.map((tab) => tab.label)).toEqual(['Article', 'Search & sharing'])
    expect(tabs.flatMap((tab) => tab.blocks)).toContain(body)
  })

  it('adds Chapters only for a horizontal layout', () => {
    const description = block('youtube-description', 'YouTube description', 'Intro\n\n00:00 Hello\n01:00 Next')
    expect(buildCopyTabs('vertical', [description], []).map((tab) => tab.label)).toEqual(['YouTube'])
    expect(buildCopyTabs('horizontal', [description], []).map((tab) => tab.label)).toEqual(['YouTube', 'Chapters'])
  })

  it('adds Cover image only for an article with a cover asset', () => {
    const cover = asset('website-cover', 'website', 'cover')
    expect(buildCopyTabs('article', [block('article-body')], []).map((tab) => tab.label)).toEqual(['Article'])
    expect(buildCopyTabs('horizontal', [block('youtube-title')], [cover]).map((tab) => tab.label)).toEqual(['YouTube'])
    expect(buildCopyTabs('article', [block('article-body')], [cover]).map((tab) => tab.label)).toEqual(['Article', 'Cover image'])
  })
})

describe('primaryPreview fallback', () => {
  it('uses the only video even when it is the other orientation', () => {
    const tall = preview({ id: 'tall' })
    const wide = preview({ id: 'wide', width: 1920, height: 1080 })
    expect(primaryPreview('horizontal', [tall])?.id).toBe('tall')
    expect(primaryPreview('vertical', [wide])?.id).toBe('wide')
  })
})
