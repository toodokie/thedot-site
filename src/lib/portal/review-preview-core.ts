// Shared, browser-safe pieces of the review preview feature (migration 0092). The upload command,
// the server readers, the retention job and the component all import from here, so the path
// layout and limits cannot drift from what the database enforces.

export const REVIEW_PREVIEW_BUCKET = 'portal-review-previews'

// Signed links are bearer links, so they stay short. Ten minutes covers watching a reel; the
// component asks the refresh route for new links when one expires mid-review.
export const PREVIEW_SIGNED_URL_TTL_SECONDS = 600

export const PREVIEW_LIMITS = {
  maxVideoBytes: 52_428_800,
  maxImageBytes: 2_097_152,
  maxFrames: 40,
  maxDurationSeconds: 240,
  maxTotalBytes: 138_412_032,
} as const

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PREVIEW_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

export type PreviewContentType = 'video/mp4' | 'image/jpeg' | 'image/png' | 'image/webp'

const CONTENT_TYPES: Record<string, PreviewContentType> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

export function fileExtension(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

export function contentTypeForPath(filePath: string): PreviewContentType {
  const type = CONTENT_TYPES[fileExtension(filePath)]
  if (!type) throw new Error(`unsupported preview file type: ${filePath}`)
  return type
}

// Must match the prefix agency_register_review_preview computes, character for character.
export function previewObjectPrefix(input: {
  clientId: string
  contentItemId: string
  contentVersion: number
  previewKey: string
  sourceSha256: string
}): string {
  if (!UUID_PATTERN.test(input.clientId)) throw new Error('invalid client id')
  if (!UUID_PATTERN.test(input.contentItemId)) throw new Error('invalid content item id')
  if (!PREVIEW_KEY_PATTERN.test(input.previewKey)) throw new Error('invalid preview key')
  if (!/^[0-9a-f]{64}$/.test(input.sourceSha256)) throw new Error('invalid source checksum')
  return `${input.clientId.toLowerCase()}/${input.contentItemId.toLowerCase()}/v${input.contentVersion}`
    + `/${input.previewKey}/${input.sourceSha256.slice(0, 16)}/`
}

export function frameObjectName(index: number, sourcePath: string): string {
  contentTypeForPath(sourcePath)
  return `frames/${String(index + 1).padStart(2, '0')}${fileExtension(sourcePath)}`
}

export type ReviewPreviewFrame = { path: string; label: string }

export type ReviewPreviewRow = {
  id: string
  client_id: string
  content_item_id: string
  content_version: number
  preview_key: string
  review_asset_key: string | null
  media_kind: 'video' | 'pages'
  object_prefix: string
  video_path: string | null
  poster_path: string | null
  frames: ReviewPreviewFrame[]
  width_px: number
  height_px: number
  duration_seconds: number | string | null
  created_at: string
}

export const REVIEW_PREVIEW_COLUMNS = 'id, client_id, content_item_id, content_version, preview_key, '
  + 'review_asset_key, media_kind, object_prefix, video_path, poster_path, frames, width_px, '
  + 'height_px, duration_seconds, created_at'

export type SignedReviewPreview = {
  id: string
  contentItemId: string
  contentVersion: number
  previewKey: string
  mediaKind: 'video' | 'pages'
  width: number
  height: number
  durationSeconds: number | null
  videoUrl: string | null
  posterUrl: string | null
  frames: Array<{ label: string; url: string }>
  expiresAt: string
}

export type SignedUrlStorage = {
  from(bucket: string): {
    createSignedUrls(paths: string[], expiresIn: number): Promise<{
      data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null
      error: { message: string } | null
    }>
  }
}

export async function signReviewPreview(
  storage: SignedUrlStorage,
  row: ReviewPreviewRow,
  now: number = Date.now(),
  ttlSeconds: number = PREVIEW_SIGNED_URL_TTL_SECONDS,
): Promise<SignedReviewPreview> {
  const paths = [row.video_path, row.poster_path, ...row.frames.map((frame) => frame.path)]
    .filter((value): value is string => typeof value === 'string')
  const { data, error } = await storage.from(REVIEW_PREVIEW_BUCKET).createSignedUrls(paths, ttlSeconds)
  if (error || !data) throw new Error(`Could not sign review preview: ${error?.message ?? 'no data'}`)
  const byPath = new Map<string, string>()
  for (const entry of data) {
    if (entry.error || !entry.path || !entry.signedUrl) {
      throw new Error(`Could not sign review preview object: ${entry.error ?? 'missing link'}`)
    }
    byPath.set(entry.path, entry.signedUrl)
  }
  const urlFor = (objectPath: string) => {
    const signed = byPath.get(objectPath)
    if (!signed) throw new Error(`Missing signed link for ${objectPath}`)
    return signed
  }
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    contentVersion: row.content_version,
    previewKey: row.preview_key,
    mediaKind: row.media_kind,
    width: row.width_px,
    height: row.height_px,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    videoUrl: row.video_path ? urlFor(row.video_path) : null,
    posterUrl: row.poster_path ? urlFor(row.poster_path) : null,
    frames: row.frames.map((frame) => ({ label: frame.label, url: urlFor(frame.path) })),
    expiresAt: new Date(now + ttlSeconds * 1000).toISOString(),
  }
}

export async function signReviewPreviews(
  storage: SignedUrlStorage,
  rows: ReviewPreviewRow[],
  now: number = Date.now(),
): Promise<SignedReviewPreview[]> {
  return Promise.all(rows.map((row) => signReviewPreview(storage, row, now)))
}
