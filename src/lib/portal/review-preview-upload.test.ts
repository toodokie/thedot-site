// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'
import {
  parseReviewPreviewPayload, uploadReviewPreview,
  type MediaProbe, type PreviewTools, type ReviewPreviewRequest,
} from './review-preview-upload'

type Rpc = { fn: string; args: Record<string, unknown> }

function fakeAdmin(options: {
  registerOutcome?: 'registered' | 'unchanged' | 'replaced'
  registerError?: string
  prefixStillUsed?: boolean
  lookupError?: string
} = {}) {
  const uploads: Array<{ bucket: string; path: string; contentType?: string; bytes: number }> = []
  const removed: string[][] = []
  const rpcs: Rpc[] = []
  const admin = {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, body: Buffer, opts: { contentType?: string }) => {
          uploads.push({ bucket, path, contentType: opts.contentType, bytes: body.length })
          return { data: { path }, error: null }
        },
        remove: async (paths: string[]) => { removed.push(paths); return { data: [], error: null } },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args })
      if (fn === 'agency_register_review_preview') {
        if (options.registerError) return { data: null, error: { message: options.registerError } }
        return { data: { preview_id: 'p1', outcome: options.registerOutcome ?? 'registered', object_prefix: args.p_object_prefix }, error: null }
      }
      if (fn === 'agency_pending_review_preview_removals') return { data: [], error: null }
      throw new Error(`unexpected rpc ${fn}`)
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => options.lookupError
          ? { data: null, error: { message: options.lookupError } }
          : ({ data: options.prefixStillUsed ? { id: 'kept' } : null, error: null }) }),
      }),
    }),
  }
  return { admin: admin as unknown as SupabaseClient, uploads, removed, rpcs }
}

function fakeTools(files: Record<string, string>, sizes: Record<string, number> = {},
  probe: MediaProbe = { width: 1080, height: 1920, durationSeconds: 24 }): PreviewTools {
  return {
    probe: async () => probe,
    faststart: async (input) => input,
    extractPoster: async () => '/work/poster.jpg',
    readFile: async (file) => {
      if (!(file in files)) throw new Error(`missing ${file}`)
      return Buffer.from(files[file])
    },
    statSize: async (file) => sizes[file] ?? Buffer.byteLength(files[file] ?? ''),
  }
}

const FILES = {
  '/r/reel.mp4': 'video-bytes',
  '/r/f1.jpg': 'frame-1',
  '/r/f2.jpg': 'frame-2',
  '/work/poster.jpg': 'poster-bytes',
  '/r/p1.png': 'page-1',
}

function videoRequest(overrides: Partial<ReviewPreviewRequest> = {}): ReviewPreviewRequest {
  return {
    clientSlug: 'kanset', contentId: 'kanset-2026-10-reel', contentVersion: 2, previewKey: 'reel',
    reviewAssetKey: null, video: '/r/reel.mp4', poster: null,
    frames: [{ path: '/r/f1.jpg', label: 'Hook' }, { path: '/r/f2.jpg', label: 'Answer' }],
    pages: [], actorKey: 'thedot-admin', ...overrides,
  }
}

const target = { clientId: '11111111-1111-4111-8111-111111111111', contentItemId: '22222222-2222-4222-8222-222222222222' }

describe('uploadReviewPreview', () => {
  it('uploads video, poster and frames under one content-addressed prefix, then registers them', async () => {
    const { admin, uploads, rpcs } = fakeAdmin()
    const result = await uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })
    expect(result.outcome).toBe('registered')
    expect(result.objectPrefix).toMatch(/^11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/v2\/reel\/[0-9a-f]{16}\/$/)
    expect(uploads.map((u) => [u.bucket, u.path.slice(result.objectPrefix.length), u.contentType])).toEqual([
      [REVIEW_PREVIEW_BUCKET, 'video.mp4', 'video/mp4'],
      [REVIEW_PREVIEW_BUCKET, 'poster.jpg', 'image/jpeg'],
      [REVIEW_PREVIEW_BUCKET, 'frames/01.jpg', 'image/jpeg'],
      [REVIEW_PREVIEW_BUCKET, 'frames/02.jpg', 'image/jpeg'],
    ])
    const register = rpcs.find((r) => r.fn === 'agency_register_review_preview')!.args
    expect(register).toMatchObject({
      p_client_id: '11111111-1111-4111-8111-111111111111', p_content_id: 'kanset-2026-10-reel', p_content_version: 2,
      p_preview_key: 'reel', p_media_kind: 'video', p_object_prefix: result.objectPrefix,
      p_video_path: `${result.objectPrefix}video.mp4`, p_poster_path: `${result.objectPrefix}poster.jpg`,
      p_width_px: 1080, p_height_px: 1920, p_duration_seconds: 24, p_actor_key: 'thedot-admin',
      p_frames: [
        { path: `${result.objectPrefix}frames/01.jpg`, label: 'Hook' },
        { path: `${result.objectPrefix}frames/02.jpg`, label: 'Answer' },
      ],
    })
    expect(register.p_byte_total).toBe(
      ['video-bytes', 'poster-bytes', 'frame-1', 'frame-2'].reduce((n, s) => n + s.length, 0))
    expect(register.p_source_sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gives identical inputs the same prefix and a changed label a new one', async () => {
    const a = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), { ...target, request: videoRequest() })
    const b = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), { ...target, request: videoRequest() })
    const c = await uploadReviewPreview(fakeAdmin().admin, fakeTools(FILES), {
      ...target, request: videoRequest({ frames: [{ path: '/r/f1.jpg', label: 'Opening' }, { path: '/r/f2.jpg', label: 'Answer' }] }),
    })
    expect(a.objectPrefix).toBe(b.objectPrefix)
    expect(c.objectPrefix).not.toBe(a.objectPrefix)
  })

  it('refuses a full-length episode render before uploading anything', async () => {
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1920, height: 1080, durationSeconds: 2213 }),
      { ...target, request: videoRequest() })).rejects.toThrow('never a full episode')
    expect(uploads).toEqual([])
  })

  it('refuses a video longer than 1200 seconds before uploading anything', async () => {
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1920, height: 1080, durationSeconds: 1200.6 }),
      { ...target, request: videoRequest() })).rejects.toThrow('cuts up to 1200s')
    expect(uploads).toEqual([])
  })

  it('accepts a 4:31 YouTube cut and a cut of exactly 1200 seconds', async () => {
    for (const durationSeconds of [271, 1200]) {
      const { admin, rpcs } = fakeAdmin()
      await uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1920, height: 1080, durationSeconds }),
        { ...target, request: videoRequest() })
      const register = rpcs.find((c) => c.fn === 'agency_register_review_preview')?.args as Record<string, unknown>
      expect(register.p_duration_seconds).toBe(durationSeconds)
    }
  })

  it('refuses an oversized video before uploading anything', async () => {
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(FILES, { '/r/reel.mp4': 60 * 1024 * 1024 }),
      { ...target, request: videoRequest() })).rejects.toThrow('the limit is 52428800')
    expect(uploads).toEqual([])
  })

  it('removes what it uploaded when registration fails', async () => {
    const { admin, uploads, removed } = fakeAdmin({ registerError: 'preview version is not the current working or released version' })
    await expect(uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() }))
      .rejects.toThrow('not the current working or released version')
    expect(removed).toEqual([uploads.map((u) => u.path)])
  })

  it('keeps the objects when a current preview already uses that prefix', async () => {
    const { admin, removed } = fakeAdmin({ registerError: 'boom', prefixStillUsed: true })
    await expect(uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })).rejects.toThrow('boom')
    expect(removed).toEqual([])
  })

  it('keeps the objects and reports the registration error when the cleanup lookup fails', async () => {
    const { admin, removed } = fakeAdmin({ registerError: 'boom', lookupError: 'db down' })
    await expect(uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })).rejects.toThrow('boom')
    expect(removed).toEqual([])
  })

  it('refuses a preview whose files together exceed the total limit, before uploading', async () => {
    const files: Record<string, string> = { ...FILES }
    const sizes: Record<string, number> = {}
    const frames = Array.from({ length: 45 }, (_, i) => {
      files[`/r/g${i}.jpg`] = `g${i}`
      sizes[`/r/g${i}.jpg`] = 2 * 1024 * 1024
      return { path: `/r/g${i}.jpg`, label: `G${i}` }
    })
    sizes['/r/reel.mp4'] = 50 * 1024 * 1024
    const { admin, uploads } = fakeAdmin()
    await expect(uploadReviewPreview(admin, fakeTools(files, sizes), { ...target, request: videoRequest({ frames }) }))
      .rejects.toThrow('preview totals')
    expect(uploads).toEqual([])
  })

  it('drains the queue when a preview was replaced', async () => {
    const { admin, rpcs } = fakeAdmin({ registerOutcome: 'replaced' })
    await uploadReviewPreview(admin, fakeTools(FILES), { ...target, request: videoRequest() })
    expect(rpcs.map((r) => r.fn)).toContain('agency_pending_review_preview_removals')
  })

  it('uploads a page preview with no video, poster or duration', async () => {
    const { admin, uploads, rpcs } = fakeAdmin()
    const result = await uploadReviewPreview(admin, fakeTools(FILES, {}, { width: 1080, height: 1350, durationSeconds: null }), {
      ...target,
      request: videoRequest({ previewKey: 'carousel', video: null, frames: [], pages: [{ path: '/r/p1.png', label: 'Page 1' }] }),
    })
    expect(uploads.map((u) => u.path.slice(result.objectPrefix.length))).toEqual(['frames/01.png'])
    expect(rpcs[0].args).toMatchObject({
      p_media_kind: 'pages', p_video_path: null, p_poster_path: null, p_duration_seconds: null,
      p_width_px: 1080, p_height_px: 1350,
    })
  })
})

describe('parseReviewPreviewPayload', () => {
  const base = { clientSlug: 'kanset', contentId: 'kanset-x', contentVersion: 1, previewKey: 'reel', video: '/r/reel.mp4' }

  it('labels plain frame paths in order', () => {
    const parsed = parseReviewPreviewPayload({ ...base, frames: ['/r/f1.jpg', { path: '/r/f2.jpg', label: 'Answer' }] })
    expect(parsed.frames).toEqual([{ path: '/r/f1.jpg', label: 'Frame 1' }, { path: '/r/f2.jpg', label: 'Answer' }])
    expect(parsed.actorKey).toBe('thedot-admin')
  })

  it('refuses relative paths, mixed kinds, unknown types and too many images', () => {
    expect(() => parseReviewPreviewPayload({ ...base, video: 'reel.mp4' })).toThrow('absolute')
    expect(() => parseReviewPreviewPayload({ ...base, pages: ['/r/p1.png'] })).toThrow('not both')
    expect(() => parseReviewPreviewPayload({ ...base, video: '/r/episode.mov' })).toThrow('unsupported preview file type')
    expect(() => parseReviewPreviewPayload({ ...base, frames: Array.from({ length: 41 }, (_, i) => `/r/f${i}.jpg`) }))
      .toThrow('at most 40')
    expect(() => parseReviewPreviewPayload({ ...base, video: null })).toThrow('a video or at least one page')
    expect(() => parseReviewPreviewPayload({ ...base, previewKey: 'Reel 1' })).toThrow('previewKey')
  })
})
