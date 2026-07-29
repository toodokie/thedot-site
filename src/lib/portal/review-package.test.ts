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

    expect(groups.map((group) => group.id)).toEqual(['social', 'creative'])
    expect(groups[0].blocks[0].body).toBe('Legacy social copy')
  })
})
