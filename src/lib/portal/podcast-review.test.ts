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

const COMBINED = ['youtube', 'instagram', 'facebook']

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
    expect(reviewPackageReadiness('podcast', blocks, assets, false, COMBINED)).toEqual({
      ready: true,
      missing: [],
    })
    expect(reviewPackageReadiness('podcast', blocks.filter((b) => b.key !== 'youtube-tags'), assets, false, COMBINED))
      .toMatchObject({ ready: false, missing: ['YouTube tags'] })
  })

  it('keeps approval closed until teaser captions are verified', () => {
    const pending = assets.map((row) => row.asset_key === 'social-teaser'
      ? { ...row, caption_status: 'burned_in_pending' as const }
      : row)
    expect(reviewPackageReadiness('podcast', blocks, pending, false, COMBINED)).toMatchObject({
      ready: false,
      missing: ['verified burned-in captions on the teaser'],
    })
  })

  it('mirrors the database: a podcast asset with the right key but the wrong channel or kind does not count', () => {
    const wrong = [
      asset('social-cover', 'youtube', 'cover'),
      asset('social-teaser', 'social', 'cover', 'burned_in_verified'),
      asset('youtube-cover', 'social', 'cover'),
    ]
    expect(reviewPackageReadiness('podcast', blocks, wrong, false, COMBINED)).toEqual({
      ready: false,
      missing: [
        'Instagram and Facebook reel cover',
        'Instagram and Facebook teaser video',
        'YouTube horizontal cover',
      ],
    })
  })

  it('mirrors the database: a website cover on the wrong channel or kind does not count', () => {
    for (const wrong of [asset('website-cover', 'social', 'cover'), asset('website-cover', 'website', 'document')]) {
      expect(reviewPackageReadiness('podcast_article', [{ key: 'article-body' }], [wrong], false, ['squarespace']))
        .toEqual({ ready: false, missing: ['website cover'] })
    }
  })

  it('treats the companion website article as its own complete package', () => {
    expect(reviewPackageReadiness(
      'podcast_article',
      [{ key: 'article-body' }],
      [asset('website-cover', 'website', 'cover')],
      false,
      ['squarespace'],
    )).toEqual({ ready: true, missing: [] })
  })

  it('preserves legacy design readiness for ordinary pieces', () => {
    expect(reviewPackageReadiness('reel', [], [], true, ['instagram']).ready).toBe(true)
    expect(reviewPackageReadiness('reel', [], [], false, ['instagram']).missing).toEqual(['linked design'])
  })

  it('treats a current review asset as a ready ordinary package', () => {
    expect(contentReviewPackageReadiness({
      format: 'reel',
      copy_blocks: [],
      platforms: ['instagram', 'facebook'],
      canva_url: null,
      drive_url: null,
    }, [asset('social-cover', 'social', 'cover')])).toEqual({ ready: true, missing: [] })
  })

  // Rule of 2026-10-06 (Anastasia): an episode is four pieces. The format 'podcast' piece is the
  // YouTube episode alone; the Instagram and Facebook trailer is its own reel. Mirrors 0100.
  describe('YouTube-only episode', () => {
    const youtubeBlocks = [{ key: 'youtube-title' }, { key: 'youtube-description' }, { key: 'youtube-tags' }]
    const youtubeCover = asset('youtube-cover', 'youtube', 'cover')

    it('is ready with the three YouTube blocks and a YouTube cover, and no Instagram or Facebook parts', () => {
      expect(reviewPackageReadiness('podcast', youtubeBlocks, [youtubeCover], false, ['youtube']))
        .toEqual({ ready: true, missing: [] })
    })

    it('still needs every YouTube block and the YouTube cover', () => {
      expect(reviewPackageReadiness('podcast', [], [], false, ['youtube'])).toEqual({
        ready: false,
        missing: ['YouTube title', 'YouTube description', 'YouTube tags', 'YouTube horizontal cover'],
      })
    })

    it('treats a podcast with no platforms as YouTube-only, like the database', () => {
      expect(reviewPackageReadiness('podcast', youtubeBlocks, [youtubeCover], false, []).ready).toBe(true)
      expect(reviewPackageReadiness('podcast', youtubeBlocks, [youtubeCover], false, null).ready).toBe(true)
    })

    it('keeps the Instagram and Facebook parts for an older combined piece', () => {
      for (const platforms of [['youtube', 'instagram'], ['facebook', 'youtube'], ['YouTube', ' Instagram ']]) {
        expect(reviewPackageReadiness('podcast', youtubeBlocks, [youtubeCover], false, platforms)).toEqual({
          ready: false,
          missing: [
            'Instagram and Facebook caption',
            'Instagram and Facebook reel cover',
            'Instagram and Facebook teaser video',
          ],
        })
      }
    })

    it('reads platforms through contentReviewPackageReadiness', () => {
      const item = { format: 'podcast', copy_blocks: youtubeBlocks, canva_url: null, drive_url: null }
      expect(contentReviewPackageReadiness({ ...item, platforms: ['youtube'] }, [youtubeCover]).ready).toBe(true)
      expect(contentReviewPackageReadiness({ ...item, platforms: COMBINED }, [youtubeCover]).ready).toBe(false)
    })
  })
})
