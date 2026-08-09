import { describe, expect, it } from 'vitest'
import { groupReviewCopy } from './review-package'

describe('groupReviewCopy', () => {
  it('keeps existing Instagram and Facebook variants visible inside one social review group', () => {
    const groups = groupReviewCopy([
      { key: 'ig-caption', label: 'Instagram caption', body: 'Instagram wording' },
      { key: 'fb-caption', label: 'Facebook caption', body: 'Facebook wording' },
      { key: 'youtube-short', label: 'YouTube Short', body: 'Title and description' },
    ], ['instagram', 'facebook', 'youtube'])

    expect(groups.map((group) => group.id)).toEqual(['social', 'youtube'])
    expect(groups[0].blocks.map((block) => block.key)).toEqual(['ig-caption', 'fb-caption'])
    expect(groups[0].description).toContain('Both are part of this one review decision')
  })

  it('treats the new shared social-caption convention as one social review block', () => {
    const groups = groupReviewCopy([
      { key: 'social-caption', label: 'Instagram + Facebook caption', body: 'Shared caption' },
      { key: 'youtube-package', label: 'YouTube package', body: 'Title and description' },
    ], ['instagram', 'facebook', 'youtube'])

    expect(groups.map((group) => group.id)).toEqual(['social', 'youtube'])
    expect(groups[0].description).toContain('One shared social caption')
  })

  it('keeps creative blocks and a legacy plain caption reviewable', () => {
    const groups = groupReviewCopy([
      { key: 'carousel', label: 'Carousel', body: 'Slide copy' },
      { key: 'caption', label: 'Caption', body: 'Legacy social copy' },
    ], ['instagram'])

    expect(groups.map((group) => group.id)).toEqual(['creative', 'social'])
    expect(groups[0].title).toBe('Carousel copy')
    expect(groups[1].blocks[0].body).toBe('Legacy social copy')
  })

  it('puts reel on-screen copy first instead of burying it as additional copy', () => {
    const groups = groupReviewCopy([
      { key: 'reel-script', label: 'Reel on-screen script', body: 'Frame copy' },
      { key: 'social-caption', label: 'Instagram + Facebook caption', body: 'Shared caption' },
      { key: 'youtube-package', label: 'YouTube package', body: 'Title and description' },
    ], ['instagram', 'facebook', 'youtube'])

    expect(groups.map((group) => group.id)).toEqual(['creative', 'social', 'youtube'])
    expect(groups[0].title).toBe('Reel on-screen copy')
    expect(groups[0].description).toContain('Review this first')
    expect(groups[0].blocks[0].key).toBe('reel-script')
  })

  it('keeps a LinkedIn adaptation in its own review group', () => {
    const groups = groupReviewCopy([
      { key: 'linkedin-post', label: 'LinkedIn post', body: 'Employer-focused adaptation' },
    ], ['linkedin'])

    expect(groups.map((group) => group.id)).toEqual(['linkedin'])
    expect(groups[0].title).toBe('LinkedIn post')
    expect(groups[0].description).toContain('its own piece')
  })

  it('shows podcast metadata as separately editable YouTube blocks', () => {
    const groups = groupReviewCopy([
      { key: 'youtube-title', label: 'YouTube title', body: 'Episode title' },
      { key: 'youtube-description', label: 'YouTube description', body: 'Episode description' },
      { key: 'youtube-tags', label: 'YouTube tags', body: 'Kanset Talks, Canadian immigration' },
      { key: 'article-body', label: 'Website article', body: 'Article copy' },
    ], ['youtube', 'squarespace'])

    expect(groups.map((group) => group.id)).toEqual(['youtube', 'website'])
    expect(groups[0].blocks.map((block) => block.key)).toEqual([
      'youtube-title', 'youtube-description', 'youtube-tags',
    ])
  })
})
