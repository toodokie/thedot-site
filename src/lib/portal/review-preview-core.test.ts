// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  PREVIEW_LIMITS, PREVIEW_SIGNED_URL_TTL_SECONDS, REVIEW_PREVIEW_BUCKET,
  contentTypeForPath, frameObjectName, previewObjectPrefix, signReviewPreview,
  type ReviewPreviewRow, type SignedUrlStorage,
} from './review-preview-core'

const SHA = 'ab'.repeat(32)
const C1 = '11111111-1111-4111-8111-111111111111'
const I1 = '22222222-2222-4222-8222-222222222222'

function row(overrides: Partial<ReviewPreviewRow> = {}): ReviewPreviewRow {
  const prefix = `${C1}/${I1}/v2/reel/${SHA.slice(0, 16)}/`
  return {
    id: 'p1', client_id: C1, content_item_id: I1, content_version: 2, preview_key: 'reel',
    review_asset_key: null, media_kind: 'video', object_prefix: prefix,
    video_path: `${prefix}video.mp4`, poster_path: `${prefix}poster.jpg`,
    frames: [{ path: `${prefix}frames/01.jpg`, label: 'Hook' }, { path: `${prefix}frames/02.jpg`, label: 'Answer' }],
    width_px: 1080, height_px: 1920, duration_seconds: 24.5, created_at: '2026-10-03T12:00:00Z',
    ...overrides,
  }
}

function storage(sign = vi.fn(async (paths: string[], _ttl?: number) => ({
  data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}?t=1`, error: null })),
  error: null,
}))): { storage: SignedUrlStorage; sign: typeof sign; bucket: string[] } {
  const bucket: string[] = []
  return { sign, bucket, storage: { from: (name: string) => { bucket.push(name); return { createSignedUrls: sign } } } }
}

describe('review preview paths', () => {
  it('builds a content-addressed prefix scoped to client, item, version and key', () => {
    expect(previewObjectPrefix({
      clientId: C1.toUpperCase(), contentItemId: I1.toUpperCase(), contentVersion: 2, previewKey: 'reel', sourceSha256: SHA,
    })).toBe(`${C1}/${I1}/v2/reel/${SHA.slice(0, 16)}/`)
  })

  it('refuses a key or checksum the database would refuse', () => {
    const base = { clientId: C1, contentItemId: I1, contentVersion: 1, sourceSha256: SHA }
    expect(() => previewObjectPrefix({ ...base, previewKey: 'Reel One' })).toThrow('invalid preview key')
    expect(() => previewObjectPrefix({ ...base, previewKey: 'reel', sourceSha256: 'xyz' })).toThrow('invalid source checksum')
  })

  it('refuses a client or item id that is not a UUID, before anything is uploaded', () => {
    const base = { contentVersion: 1, previewKey: 'reel', sourceSha256: SHA }
    expect(() => previewObjectPrefix({ ...base, clientId: 'client-1', contentItemId: I1 })).toThrow('invalid client id')
    expect(() => previewObjectPrefix({ ...base, clientId: C1, contentItemId: '../x' })).toThrow('invalid content item id')
    expect(() => previewObjectPrefix({ ...base, clientId: `${C1}/..`, contentItemId: I1 })).toThrow('invalid client id')
  })

  it('names frames in order and keeps the image extension', () => {
    expect(frameObjectName(0, '/renders/Contact Sheet 1.JPG')).toBe('frames/01.jpg')
    expect(frameObjectName(11, '/renders/page.png')).toBe('frames/12.png')
  })

  it('maps only the four allowed media types', () => {
    expect(contentTypeForPath('/a/video.MP4')).toBe('video/mp4')
    expect(contentTypeForPath('/a/f.jpeg')).toBe('image/jpeg')
    expect(contentTypeForPath('/a/f.webp')).toBe('image/webp')
    expect(() => contentTypeForPath('/a/episode.mov')).toThrow('unsupported preview file type')
    expect(() => frameObjectName(0, '/a/page.pdf')).toThrow('unsupported preview file type')
  })

  it('keeps the limits the migration enforces', () => {
    expect(PREVIEW_LIMITS.maxVideoBytes).toBe(52_428_800)
    expect(PREVIEW_LIMITS.maxDurationSeconds).toBe(240)
    expect(PREVIEW_LIMITS.maxFrames).toBe(40)
    expect(PREVIEW_LIMITS.maxTotalBytes).toBe(52_428_800 + 41 * 2_097_152)
  })
})

describe('signReviewPreview', () => {
  it('signs every object once, from the private bucket, for the short TTL', async () => {
    const { storage: s, sign, bucket } = storage()
    const signed = await signReviewPreview(s, row(), Date.parse('2026-10-03T12:00:00Z'))
    expect(bucket).toEqual([REVIEW_PREVIEW_BUCKET])
    expect(sign).toHaveBeenCalledTimes(1)
    expect(sign.mock.calls[0][1]).toBe(PREVIEW_SIGNED_URL_TTL_SECONDS)
    expect(sign.mock.calls[0][0]).toHaveLength(4)
    expect(signed.videoUrl).toContain('video.mp4')
    expect(signed.posterUrl).toContain('poster.jpg')
    expect(signed.frames).toEqual([
      { label: 'Hook', url: expect.stringContaining('frames/01.jpg') },
      { label: 'Answer', url: expect.stringContaining('frames/02.jpg') },
    ])
    expect(signed.expiresAt).toBe('2026-10-03T12:10:00.000Z')
    expect(signed.durationSeconds).toBe(24.5)
  })

  it('signs a page preview without a video or poster', async () => {
    const prefix = `${C1}/${I1}/v1/pdf/${SHA.slice(0, 16)}/`
    const { storage: s } = storage()
    const signed = await signReviewPreview(s, row({
      media_kind: 'pages', video_path: null, poster_path: null, duration_seconds: null,
      frames: [{ path: `${prefix}frames/01.png`, label: 'Page 1' }],
    }))
    expect(signed.videoUrl).toBeNull()
    expect(signed.posterUrl).toBeNull()
    expect(signed.frames).toHaveLength(1)
  })

  it('fails loudly when any object cannot be signed', async () => {
    const { storage: s } = storage(vi.fn(async (paths: string[], _ttl?: number) => ({
      data: paths.map((path, i) => ({ path, signedUrl: i === 1 ? '' : `https://signed.example/${path}`, error: i === 1 ? 'Object not found' : null })),
      error: null,
    })))
    await expect(signReviewPreview(s, row())).rejects.toThrow('Object not found')
  })

  it('fails when an entry has no link even without an error', async () => {
    const { storage: s } = storage(vi.fn(async (paths: string[], _ttl?: number) => ({
      data: paths.map((path, i) => ({ path, signedUrl: i === 0 ? null : `https://signed.example/${path}`, error: null })),
      error: null,
    })))
    await expect(signReviewPreview(s, row())).rejects.toThrow('missing link')
  })
})
