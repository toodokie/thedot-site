import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertClientSafeAgencyText, optionalText, requiredText } from './agency-write'
import {
  PREVIEW_KEY_PATTERN, PREVIEW_LIMITS, REVIEW_PREVIEW_BUCKET,
  contentTypeForPath, fileExtension, frameObjectName, previewObjectPrefix,
} from './review-preview-core'
import { drainReviewPreviewRemovals } from './review-preview-retention'

// Agency upload path for portal review previews (migration 0092). The input is the same local
// render file that goes to Drive; Drive stays the master and keeps the link Anastasia supplies.

export type PreviewFileInput = { path: string; label: string }

export type ReviewPreviewRequest = {
  clientSlug: string
  contentId: string
  contentVersion: number
  previewKey: string
  reviewAssetKey: string | null
  video: string | null
  poster: string | null
  frames: PreviewFileInput[]
  pages: PreviewFileInput[]
  actorKey: string
}

export type MediaProbe = { width: number; height: number; durationSeconds: number | null }

export type PreviewTools = {
  probe(file: string): Promise<MediaProbe>
  faststart(video: string): Promise<string>
  extractPoster(video: string): Promise<string>
  readFile(file: string): Promise<Buffer>
  statSize(file: string): Promise<number>
}

export type UploadResult = {
  outcome: 'registered' | 'unchanged' | 'replaced'
  previewId: string
  objectPrefix: string
  bytes: number
}

function fileList(value: unknown, field: string, labelPrefix: string): PreviewFileInput[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`)
  return value.map((entry, index) => {
    if (typeof entry === 'string') return { path: entry.trim(), label: `${labelPrefix} ${index + 1}` }
    if (entry && typeof entry === 'object') {
      const record = entry as Record<string, unknown>
      return {
        path: requiredText(record.path, `${field}[${index}].path`, 1000),
        label: optionalText(record.label, `${field}[${index}].label`, 80) ?? `${labelPrefix} ${index + 1}`,
      }
    }
    throw new Error(`${field}[${index}] must be a path or {path, label}`)
  })
}

export function parseReviewPreviewPayload(payload: Record<string, unknown>): ReviewPreviewRequest {
  const contentVersion = payload.contentVersion
  if (!Number.isInteger(contentVersion) || (contentVersion as number) < 1) {
    throw new Error('contentVersion must be an integer >= 1')
  }
  const previewKey = requiredText(payload.previewKey, 'previewKey', 64)
  if (!PREVIEW_KEY_PATTERN.test(previewKey)) {
    throw new Error('previewKey must be lowercase letters, digits, - or _ (for example reel, teaser, carousel)')
  }
  const video = optionalText(payload.video, 'video', 1000)
  const poster = optionalText(payload.poster, 'poster', 1000)
  const frames = fileList(payload.frames, 'frames', 'Frame')
  const pages = fileList(payload.pages, 'pages', 'Page')
  if (video && pages.length > 0) throw new Error('give either video (with frames) or pages, not both')
  if (!video && pages.length === 0) throw new Error('a preview needs a video or at least one page')
  if (!video && (poster || frames.length > 0)) throw new Error('poster and frames belong to a video preview')
  const images = [...(poster ? [poster] : []), ...frames.map((f) => f.path), ...pages.map((p) => p.path)]
  for (const file of [...(video ? [video] : []), ...images]) {
    if (!path.isAbsolute(file)) throw new Error(`file paths must be absolute: ${file}`)
  }
  if (video && contentTypeForPath(video) !== 'video/mp4') throw new Error('video must be an .mp4 file')
  for (const image of images) {
    if (contentTypeForPath(image) === 'video/mp4') throw new Error(`expected an image: ${image}`)
  }
  if (frames.length + pages.length > PREVIEW_LIMITS.maxFrames) {
    throw new Error(`a preview carries at most ${PREVIEW_LIMITS.maxFrames} frames or pages`)
  }
  const labels = [...frames, ...pages].map((f) => f.label).join('\n')
  if (labels) assertClientSafeAgencyText({ frameLabels: labels })
  return {
    clientSlug: requiredText(payload.clientSlug, 'clientSlug', 100),
    contentId: requiredText(payload.contentId, 'contentId', 200),
    contentVersion: contentVersion as number,
    previewKey,
    reviewAssetKey: optionalText(payload.reviewAssetKey, 'reviewAssetKey', 64),
    video,
    poster,
    frames,
    pages,
    actorKey: requiredText(payload.actorKey ?? 'thedot-admin', 'actorKey', 64),
  }
}

const run = promisify(execFile)

// Real tools for Anastasia's Mac (ffmpeg and ffprobe are installed). workDir must sit under
// /tmp/kanset-<content-id>/ per CONTENT-HOUSEKEEPING.md; the caller deletes it afterwards.
export function ffmpegTools(workDir: string): PreviewTools {
  return {
    async probe(file) {
      const { stdout } = await run('ffprobe', [
        '-v', 'error', '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file,
      ])
      const parsed = JSON.parse(stdout) as {
        streams?: Array<{ width?: number; height?: number }>
        format?: { duration?: string }
      }
      const stream = parsed.streams?.[0]
      if (!stream?.width || !stream?.height) throw new Error(`no picture found in ${file}`)
      const duration = parsed.format?.duration ? Number(parsed.format.duration) : Number.NaN
      return { width: stream.width, height: stream.height, durationSeconds: Number.isFinite(duration) ? duration : null }
    },
    async faststart(video) {
      await mkdir(workDir, { recursive: true })
      const output = path.join(workDir, 'faststart.mp4')
      // Lossless remux that moves the index to the front, so the browser can start playing before
      // the whole file has downloaded. No re-encode: on-screen text stays pixel-identical.
      await run('ffmpeg', ['-v', 'error', '-y', '-i', video, '-map', '0:v:0', '-map', '0:a?',
        '-c', 'copy', '-movflags', '+faststart', output])
      return output
    },
    async extractPoster(video) {
      await mkdir(workDir, { recursive: true })
      const output = path.join(workDir, 'poster.jpg')
      // Frame one is the cover for graphic reels (memory: no-cover-for-graphic-reels).
      await run('ffmpeg', ['-v', 'error', '-y', '-ss', '0', '-i', video, '-frames:v', '1', '-q:v', '3', output])
      return output
    },
    readFile: (file) => readFile(file),
    statSize: async (file) => (await stat(file)).size,
  }
}

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function uploadReviewPreview(
  admin: SupabaseClient,
  tools: PreviewTools,
  input: { clientId: string; contentItemId: string; request: ReviewPreviewRequest },
): Promise<UploadResult> {
  const { request } = input
  const isVideo = request.video !== null
  const imageInputs = isVideo ? request.frames : request.pages

  // The checksum covers the SOURCE files and labels, never derived files, so re-running the same
  // command always lands on the same prefix and the database answers "unchanged".
  const hash = createHash('sha256').update(isVideo ? 'video\n' : 'pages\n')
  const sources = isVideo
    ? [request.video as string, ...(request.poster ? [request.poster] : []), ...request.frames.map((f) => f.path)]
    : request.pages.map((p) => p.path)
  for (const file of sources) hash.update(`${sha256Hex(await tools.readFile(file))}\n`)
  for (const item of imageInputs) hash.update(`label:${item.label}\n`)
  const sourceSha256 = hash.digest('hex')
  const prefix = previewObjectPrefix({
    clientId: input.clientId,
    contentItemId: input.contentItemId,
    contentVersion: request.contentVersion,
    previewKey: request.previewKey,
    sourceSha256,
  })

  const uploads: Array<{ objectPath: string; file: string; maxBytes: number }> = []
  let videoPath: string | null = null
  let posterPath: string | null = null
  let durationSeconds: number | null = null
  let width: number
  let height: number

  if (isVideo) {
    const media = await tools.probe(request.video as string)
    if (media.durationSeconds === null || media.durationSeconds <= 0) {
      throw new Error('could not read the video duration')
    }
    if (media.durationSeconds > PREVIEW_LIMITS.maxDurationSeconds) {
      throw new Error(`video runs ${Math.round(media.durationSeconds)}s; previews are teasers and cuts up to `
        + `${PREVIEW_LIMITS.maxDurationSeconds}s, never a full episode`)
    }
    width = media.width
    height = media.height
    durationSeconds = Math.round(media.durationSeconds * 100) / 100
    const prepared = await tools.faststart(request.video as string)
    const poster = request.poster ?? await tools.extractPoster(request.video as string)
    videoPath = `${prefix}video.mp4`
    posterPath = `${prefix}poster${fileExtension(poster)}`
    uploads.push(
      { objectPath: videoPath, file: prepared, maxBytes: PREVIEW_LIMITS.maxVideoBytes },
      { objectPath: posterPath, file: poster, maxBytes: PREVIEW_LIMITS.maxImageBytes },
    )
  } else {
    const first = await tools.probe(request.pages[0].path)
    width = first.width
    height = first.height
  }
  const frames = imageInputs.map((item, index) => ({ path: `${prefix}${frameObjectName(index, item.path)}`, label: item.label }))
  imageInputs.forEach((item, index) => {
    uploads.push({ objectPath: frames[index].path, file: item.path, maxBytes: PREVIEW_LIMITS.maxImageBytes })
  })

  let bytes = 0
  for (const upload of uploads) {
    const size = await tools.statSize(upload.file)
    if (size > upload.maxBytes) {
      throw new Error(`${upload.file} is ${size} bytes; the limit is ${upload.maxBytes}`)
    }
    bytes += size
  }
  if (bytes > PREVIEW_LIMITS.maxTotalBytes) {
    throw new Error(`preview totals ${bytes} bytes; the limit is ${PREVIEW_LIMITS.maxTotalBytes}`)
  }

  const uploaded: string[] = []
  try {
    for (const upload of uploads) {
      const { error } = await admin.storage.from(REVIEW_PREVIEW_BUCKET).upload(
        upload.objectPath,
        await tools.readFile(upload.file),
        { contentType: contentTypeForPath(upload.objectPath), upsert: true, cacheControl: '86400' },
      )
      if (error) throw new Error(`upload ${upload.objectPath}: ${error.message}`)
      uploaded.push(upload.objectPath)
    }
    const { data, error } = await admin.rpc('agency_register_review_preview', {
      p_client_id: input.clientId,
      p_content_id: request.contentId,
      p_content_version: request.contentVersion,
      p_preview_key: request.previewKey,
      p_review_asset_key: request.reviewAssetKey,
      p_media_kind: isVideo ? 'video' : 'pages',
      p_object_prefix: prefix,
      p_video_path: videoPath,
      p_poster_path: posterPath,
      p_frames: frames,
      p_width_px: width,
      p_height_px: height,
      p_duration_seconds: durationSeconds,
      p_byte_total: bytes,
      p_source_sha256: sourceSha256,
      p_actor_key: request.actorKey,
    })
    if (error) throw new Error(`agency_register_review_preview: ${error.message}`)
    const response = data as { preview_id: string; outcome: UploadResult['outcome']; object_prefix: string }
    if (response.outcome === 'replaced') await drainReviewPreviewRemovals(admin, { limit: 50 })
    return { outcome: response.outcome, previewId: response.preview_id, objectPrefix: prefix, bytes }
  } catch (error) {
    if (uploaded.length > 0) {
      const { data: kept } = await admin.from('content_review_previews')
        .select('id').eq('object_prefix', prefix).maybeSingle()
      if (!kept) await admin.storage.from(REVIEW_PREVIEW_BUCKET).remove(uploaded)
    }
    throw error
  }
}
