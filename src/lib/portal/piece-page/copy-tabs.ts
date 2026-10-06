// Page layout and copy tabs (spec 2026-10-03 sections 4.2 and 4.3). Presentation only: every
// block lands in exactly one content tab (a Chapters tab is an extra view of the description),
// nothing is merged, rewritten or dropped.
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { ReviewCopyBlock } from '@/lib/portal/review-package'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { findChapters, parseYouTubePackage, youTubeFieldValue } from './youtube-fields'

export type PieceLayout = 'vertical' | 'horizontal' | 'pages' | 'article' | 'text'
export type TabKind =
  | 'onscreen' | 'caption' | 'youtube' | 'chapters' | 'document' | 'post' | 'first-comment'
  | 'article' | 'seo' | 'cover' | 'other'
export type CopyTab = { key: string; kind: TabKind; label: string; blocks: ReviewCopyBlock[] }

const ONSCREEN = new Set(['reel-script', 'onscreen-script', 'on-screen-copy', 'on-screen-text', 'video-script',
  'reel-dialogue', 'storyboard'])
const CAPTION = new Set(['social-caption', 'ig-facebook-caption', 'ig-caption', 'fb-caption', 'instagram-caption',
  'facebook-caption', 'caption', 'fb-adaptation', 'hashtags'])
const DOCUMENT = new Set(['linkedin-document-copy', 'document-copy', 'carousel-copy', 'carousel-slides', 'carousel', 'slides'])
const POST = new Set(['linkedin-caption', 'linkedin-post'])
const FIRST_COMMENT = new Set(['linkedin-first-comment', 'first-comment'])

const VERTICAL_FORMATS = new Set(['reel', 'vertical_video', 'short'])
const HORIZONTAL_FORMATS = new Set(['podcast', 'episode'])
const PAGES_FORMATS = new Set(['carousel', 'single', 'post', 'linkedin-post', 'graphic'])

export function blockTabKind(block: ReviewCopyBlock): TabKind {
  const key = (block.key ?? '').toLowerCase()
  const label = block.label.toLowerCase()
  if (key === 'article-body') return 'article'
  if (key === 'article-seo') return 'seo'
  if (DOCUMENT.has(key)) return 'document'
  if (POST.has(key)) return 'post'
  if (FIRST_COMMENT.has(key)) return 'first-comment'
  if (key.startsWith('youtube') || label.includes('youtube')) return 'youtube'
  if (ONSCREEN.has(key) || label.includes('on-screen') || label.includes('on screen')) return 'onscreen'
  if (CAPTION.has(key) || key === '') return 'caption'
  return 'other'
}

export function pieceLayout(
  format: string | null,
  blocks: ReviewCopyBlock[],
  previews: SignedReviewPreview[],
): PieceLayout {
  const kinds = new Set(blocks.map(blockTabKind))
  if (kinds.has('article')) return 'article'
  const f = (format ?? '').toLowerCase()
  if (HORIZONTAL_FORMATS.has(f)) return 'horizontal'
  if (VERTICAL_FORMATS.has(f)) return 'vertical'
  if (PAGES_FORMATS.has(f)) {
    // A post format usually carries pages (a document or a single image), but a LinkedIn or
    // feed post can be a video. When the only preview is a video, show the video
    // (Kanset Talks ep4 LinkedIn trailer, 2026-10-06).
    const onlyVideo = previews.find((p) => p.mediaKind === 'video')
    if (onlyVideo && !previews.some((p) => p.mediaKind === 'pages')) {
      return onlyVideo.width > onlyVideo.height ? 'horizontal' : 'vertical'
    }
    return 'pages'
  }
  const video = previews.find((p) => p.mediaKind === 'video')
  if (video) return video.width > video.height ? 'horizontal' : 'vertical'
  if (previews.some((p) => p.mediaKind === 'pages') || kinds.has('document')) return 'pages'
  if (kinds.has('onscreen')) return 'vertical'
  return 'text'
}

export function primaryPreview(layout: PieceLayout, previews: SignedReviewPreview[]): SignedReviewPreview | null {
  const videos = previews.filter((p) => p.mediaKind === 'video' && p.videoUrl)
  if (layout === 'horizontal') return videos.find((p) => p.width > p.height) ?? videos[0] ?? null
  if (layout === 'vertical') return videos.find((p) => p.height >= p.width) ?? videos[0] ?? null
  if (layout === 'article') {
    return previews.find((p) => p.previewKey === 'website-cover') ?? previews.find((p) => p.mediaKind === 'pages') ?? null
  }
  if (layout === 'pages') return previews.find((p) => p.mediaKind === 'pages') ?? null
  return null
}

const ORDER: Record<PieceLayout, Array<Exclude<TabKind, 'other'>>> = {
  vertical: ['onscreen', 'caption', 'youtube', 'post', 'first-comment', 'document', 'chapters'],
  horizontal: ['youtube', 'caption', 'chapters', 'onscreen', 'post', 'first-comment', 'document'],
  pages: ['document', 'caption', 'post', 'first-comment', 'youtube', 'onscreen'],
  article: ['article', 'seo', 'cover', 'caption', 'post', 'first-comment', 'youtube', 'onscreen', 'document'],
  text: ['caption', 'post', 'first-comment', 'youtube', 'onscreen', 'document'],
}

const LABEL: Record<Exclude<TabKind, 'document' | 'other'>, string> = {
  onscreen: 'On-screen text', caption: 'Caption', youtube: 'YouTube', chapters: 'Chapters', post: 'Post',
  'first-comment': 'First comment', article: 'Article', seo: 'Search & sharing', cover: 'Cover image',
}

function documentLabel(blocks: ReviewCopyBlock[]): string {
  return blocks.some((b) => (b.key ?? '').includes('linkedin') || b.key === 'document-copy') ? 'PDF text' : 'Slide text'
}

function chaptersBlock(blocks: ReviewCopyBlock[]): ReviewCopyBlock | null {
  for (const block of blocks) {
    if (blockTabKind(block) !== 'youtube') continue
    const pkg = block.key === 'youtube-description' ? null : parseYouTubePackage(block.body)
    const description = block.key === 'youtube-description' ? block.body : pkg ? youTubeFieldValue(pkg, 'description') : null
    if (description && findChapters(description)) return block
  }
  return null
}

export function buildCopyTabs(layout: PieceLayout, blocks: ReviewCopyBlock[], assets: ReviewAsset[]): CopyTab[] {
  const grouped = new Map<Exclude<TabKind, 'other'>, ReviewCopyBlock[]>()
  const others: CopyTab[] = []
  for (const block of blocks) {
    const kind = blockTabKind(block)
    if (kind === 'other') {
      others.push({ key: `other:${block.key ?? 'body'}`.slice(0, 64), kind, label: block.label, blocks: [block] })
      continue
    }
    grouped.set(kind, [...(grouped.get(kind) ?? []), block])
  }
  const chapters = layout === 'horizontal' ? chaptersBlock(blocks) : null
  const hasCover = layout === 'article'
    && assets.some((a) => a.asset_key === 'website-cover' || (a.channel === 'website' && a.asset_kind === 'cover'))

  const tabs: CopyTab[] = []
  for (const kind of ORDER[layout]) {
    if (kind === 'chapters') {
      if (chapters) tabs.push({ key: 'chapters', kind, label: LABEL.chapters, blocks: [chapters] })
      continue
    }
    if (kind === 'cover') {
      if (hasCover) tabs.push({ key: 'cover', kind, label: LABEL.cover, blocks: [] })
      continue
    }
    const group = grouped.get(kind)
    if (!group) continue
    tabs.push({ key: kind, kind, label: kind === 'document' ? documentLabel(group) : LABEL[kind], blocks: group })
    grouped.delete(kind)
  }
  for (const [kind, group] of grouped) {
    if (kind === 'chapters' || kind === 'cover') continue
    tabs.push({ key: kind, kind, label: kind === 'document' ? documentLabel(group) : LABEL[kind], blocks: group })
  }
  return [...tabs, ...others]
}
