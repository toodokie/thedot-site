import { describe, expect, it } from 'vitest'
import { contentReviewPackageReadiness, reviewPackageReadiness } from './podcast-review'
import type { ReviewAsset } from './review-assets'

function asset(
  asset_key: string,
  channel: ReviewAsset['channel'],
  asset_kind: ReviewAsset['asset_kind'],
  caption_status: ReviewAsset['caption_status'] = 'not_applicable',
): ReviewAsset {
  return {
    id: asset_key,
    content_version: 1,
    asset_key,
    label: asset_key,
    channel,
    asset_kind,
    url: 'https://drive.google.com/open?id=test',
    width_px: 1080,
    height_px: 1920,
    caption_status,
    review_note: null,
  }
}

describe('podcast review-package readiness', () => {
  const blocks = [
    { key: 'social-caption' },
    { key: 'youtube-title' },
    { key: 'youtube-description' },
    { key: 'youtube-tags' },
  ]
  const assets = [
    asset('social-cover', 'social', 'cover'),
    asset('social-teaser', 'social', 'video', 'burned_in_verified'),
    asset('youtube-cover', 'youtube', 'cover'),
  ]

  it('requires every podcast copy surface and exact review asset', () => {
    expect(reviewPackageReadiness('podcast', blocks, assets, false)).toEqual({
      ready: true,
      missing: [],
    })
    expect(reviewPackageReadiness('podcast', blocks.filter((b) => b.key !== 'youtube-tags'), assets, false))
      .toMatchObject({ ready: false, missing: ['YouTube tags'] })
  })

  it('keeps approval closed until teaser captions are verified', () => {
    const pending = assets.map((row) => row.asset_key === 'social-teaser'
      ? { ...row, caption_status: 'burned_in_pending' as const }
      : row)
    expect(reviewPackageReadiness('podcast', blocks, pending, false)).toMatchObject({
      ready: false,
      missing: ['verified burned-in captions on the teaser'],
    })
  })

  it('treats the companion website article as its own complete package', () => {
    expect(reviewPackageReadiness(
      'podcast_article',
      [{ key: 'article-body' }],
      [asset('website-cover', 'website', 'cover')],
      false,
    )).toEqual({ ready: true, missing: [] })
  })

  it('preserves legacy design readiness for ordinary pieces', () => {
    expect(reviewPackageReadiness('reel', [], [], true).ready).toBe(true)
    expect(reviewPackageReadiness('reel', [], [], false).missing).toEqual(['linked design'])
  })

  it('treats a current review asset as a ready ordinary package', () => {
    expect(contentReviewPackageReadiness({
      format: 'reel',
      copy_blocks: [],
      canva_url: null,
      drive_url: null,
    }, [asset('social-cover', 'social', 'cover')])).toEqual({ ready: true, missing: [] })
  })
})
