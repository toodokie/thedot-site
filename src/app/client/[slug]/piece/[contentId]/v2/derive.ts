// Server-side derivation for the redesigned piece page (spec 2026-10-03). The rules copied from
// PieceReviewScreen are unchanged: published, readiness, unresolved edits, revision started,
// who may edit, schedule and removal rights. Pure; the page passes everything in.
import type { ClientSession } from '@/lib/portal/auth'
import type { CommentRow } from '@/lib/portal/comments'
import type { ContentRow } from '@/lib/portal/data'
import { appliedChanges, updatedAreasLine, updatedTabKeys } from '@/lib/portal/piece-page/changed-passages'
import { buildCopyTabs, pieceLayout, primaryPreview, type CopyTab, type PieceLayout } from '@/lib/portal/piece-page/copy-tabs'
import { destinationLabel, headerStatus, type HeaderStatus } from '@/lib/portal/piece-page/header-status'
import { buildSentEditIndex, type SentEditIndex } from '@/lib/portal/piece-page/sent-edits'
import { contentReviewPackageReadiness } from '@/lib/portal/podcast-review'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import { reReviewContext } from '@/lib/portal/re-review'
import { contentRequestTarget, isUnresolvedContentRequest, type ContentRequestMessage, type ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import type { ScheduleRequestRow, ScheduleTargetRow } from '@/lib/portal/schedule'
import type { ClientState } from '@/lib/portal/state'
import type { CoverInfo } from './panels/CoverImagePanel'

export type WorkspaceMode = 'client' | 'preview'
// Plan 4b amendment 2026-10-04 (Task 10b): a reel, Short, cut or episode cover as its own first
// tile in the media area. The image is the preview's poster (the approved cover, per the upload
// rule); a note on it targets the cover review asset, so there is no suggestion without one.
export type CoverTile = {
  label: 'Cover' | 'YouTube thumbnail'
  imageUrl: string | null
  driveUrl: string | null
  wide: boolean
  target: { key: string; url: string } | null
}
export type VisualTarget = { kind: 'asset' | 'design_link'; key: string; label: string; url: string | null; anchors: boolean }

export type WorkspaceData = {
  slug: string
  contentId: string
  version: number
  title: string
  formatLabel: string
  layout: PieceLayout
  tabs: CopyTab[]
  updatedTabKeys: string[]
  updatedLine: string | null
  beforeByBlock: Record<string, string>
  reReview: boolean
  preview: SignedReviewPreview | null
  previewRefreshUrl: string | null
  fallbackMedia: Array<{ label: string; url: string }>
  episodeDriveUrl: string | null
  mediaPending: boolean
  visualTarget: VisualTarget | null
  cover: CoverInfo | null
  coverTile: CoverTile | null
  status: HeaderStatus
  approvedLabel: string
  postedLabel: string
  canRequestSchedule: boolean
  scheduleHasExternalTargets: boolean
  activeScheduleRequest: { kind: 'reschedule' | 'cancel'; when: string | null } | null
  removal: { slug: string; contentId: string; idempotencyKey: string } | null
  canEdit: boolean
  canDecide: boolean
  canComment: boolean
  canSubmitRequests: boolean
  isPublished: boolean
  state: ClientState
  revisionStarted: boolean
  sentSummary: { count: number; dateLabel: string | null }
  packageReady: boolean
  missing: string[]
  comments: CommentRow[]
  ledger: ContentRow['fact_check_ledger']
  factCheckScope: ContentRow['fact_check_scope']
  factCheckExemption: string | null
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  // Her sent, not-yet-applied edits for this version, by the spot they came from (Task 10a).
  sentEdits: SentEditIndex
  item: ContentRow
  showIntro: boolean
  backHref: string
  backLabel: string
}

export type DeriveInput = {
  slug: string
  item: ContentRow
  comments: CommentRow[]
  schedule: { targets: ScheduleTargetRow[]; requests: ScheduleRequestRow[] }
  publication: PublicationTargetRow[]
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  reviewAssets: ReviewAsset[]
  previews: SignedReviewPreview[]
  capabilities: Pick<ClientSession, 'canDecide' | 'canComment' | 'canSubmitRequests' | 'canManageSchedule'>
  showIntro: boolean
  backHref: string
  backLabel: string
  // '/api/client/<slug>/review-previews' for a client seat, '/api/admin/portal/review-previews' for the preview.
  previewRefreshBase: string
  removalKey: string
}

const FORMAT_NAMES: Record<string, string> = {
  reel: 'Reel', vertical_video: 'Vertical video', podcast: 'Podcast episode', podcast_article: 'Website article',
  article: 'Website article', carousel: 'Carousel', single: 'Single post', post: 'Post', 'linkedin-post': 'LinkedIn post',
}

export function pieceFormatLabel(format: string | null, platforms: string[]): string {
  const name = FORMAT_NAMES[(format ?? '').toLowerCase()] ?? 'Piece'
  const where = [...new Set(platforms.map(destinationLabel))].join(', ')
  return where ? `${name} · ${where}` : name
}

function isHttps(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https:\/\//i.test(url)
}

// Copied from SchedulePanel: the requested Toronto wall time, shown as entered.
function displayRequestedLocal(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (!match) return value.slice(0, 16).replace('T', ' ')
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]))),
  )
}

function torontoMonthDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Toronto', month: 'short', day: 'numeric' }).format(new Date(iso))
}

const SCHEDULE_REQUEST_STATES = new Set<ClientState>(['approved', 'partially_scheduled', 'schedule_failed', 'scheduled'])

function pickVisualTarget(
  layout: PieceLayout,
  preview: SignedReviewPreview | null,
  assets: ReviewAsset[],
  designLinks: Array<{ key: 'canva' | 'drive'; label: string; url: string }>,
): VisualTarget | null {
  const kinds: ReviewAsset['asset_kind'][] = layout === 'pages' ? ['document', 'cover']
    : layout === 'article' ? ['cover'] : ['video']
  const byKey = preview?.reviewAssetKey ? assets.find((a) => a.asset_key === preview.reviewAssetKey) : undefined
  const chosen = byKey ?? assets.find((a) => kinds.includes(a.asset_kind))
  if (chosen) {
    return {
      kind: 'asset', key: chosen.asset_key, label: chosen.label, url: chosen.url,
      anchors: Boolean(preview && preview.frames.length > 0),
    }
  }
  const link = designLinks.find((l) => l.key === 'drive') ?? designLinks[0]
  return link ? { kind: 'design_link', key: link.key, label: `${link.label} design`, url: link.url, anchors: false } : null
}

function pickCoverTile(layout: PieceLayout, preview: SignedReviewPreview | null, assets: ReviewAsset[]): CoverTile | null {
  if (layout !== 'vertical' && layout !== 'horizontal') return null
  const wide = layout === 'horizontal'
  const covers = assets.filter((a) => a.asset_kind === 'cover' && a.channel !== 'website' && a.asset_key !== 'website-cover')
  const fits = (a: ReviewAsset) => (wide ? a.width_px > a.height_px : a.height_px >= a.width_px)
  const asset = wide
    ? covers.find((a) => a.asset_key === 'youtube-cover') ?? covers.find(fits)
    : covers.find((a) => a.asset_key !== 'youtube-cover' && fits(a))
  const imageUrl = preview?.posterUrl ?? null
  if (!imageUrl && !asset) return null
  return {
    label: wide ? 'YouTube thumbnail' : 'Cover',
    imageUrl,
    driveUrl: asset && isHttps(asset.url) ? asset.url : null,
    wide,
    target: asset ? { key: asset.asset_key, url: asset.url } : null,
  }
}

export function deriveWorkspaceData(input: DeriveInput): WorkspaceData {
  const { item, capabilities } = input
  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Caption', body: item.client_body }] : [])
  const layout = pieceLayout(item.format, blocks, input.previews)
  const preview = primaryPreview(layout, input.previews)
  const tabs = buildCopyTabs(layout, blocks, input.reviewAssets)

  const isPublished = input.publication.some((target) => target.status === 'live')
    || ['live', 'partially_live'].includes(item.state)
  const readiness = contentReviewPackageReadiness({ ...item, copy_blocks: blocks }, input.reviewAssets)
  const unresolved = input.requests.filter((r) => r.base_version === item.version
    && isUnresolvedContentRequest(r.status) && contentRequestTarget(r) !== null)
  const revisionStarted = unresolved.some((r) => ['applying', 'prepared'].includes(r.status))
  const firstSent = unresolved.map((r) => r.created_at).filter(Boolean).sort()[0]

  const reReview = reReviewContext(item.version, item.state, item.current_decision, input.requests)
  const changes = appliedChanges(item.version, input.requests)
  const updated = reReview ? updatedTabKeys(tabs, changes) : new Set<string>()

  const designLinks = [
    isHttps(item.canva_url) ? { key: 'canva' as const, label: 'Canva', url: item.canva_url } : null,
    isHttps(item.drive_url) ? { key: 'drive' as const, label: 'Google Drive', url: item.drive_url } : null,
  ].filter((link): link is { key: 'canva' | 'drive'; label: string; url: string } => link !== null)
  const expectsMedia = layout === 'vertical' || layout === 'horizontal' || layout === 'pages'
  const mediaKinds: ReviewAsset['asset_kind'][] = layout === 'pages' ? ['document', 'cover'] : ['video']
  const mediaAssets = input.reviewAssets.filter((a) => mediaKinds.includes(a.asset_kind))
  const fallbackMedia = expectsMedia && !preview
    ? (mediaAssets.length > 0
      ? mediaAssets.map((a) => ({ label: a.label, url: a.url }))
      : designLinks.map((l) => ({ label: l.label, url: l.url })))
    : []

  const coverAsset = input.reviewAssets.find((a) => a.asset_key === 'website-cover' || (a.channel === 'website' && a.asset_kind === 'cover'))
  const cover: CoverInfo | null = layout === 'article' && coverAsset
    ? { label: coverAsset.label, url: coverAsset.url, previewUrl: preview?.frames[0]?.url ?? null,
      width: coverAsset.width_px, height: coverAsset.height_px }
    : null

  const visualTarget = pickVisualTarget(layout, preview, input.reviewAssets, designLinks)
  const coverTile = pickCoverTile(layout, preview, input.reviewAssets)
  // A whole-visual note has a place on the page only where the media area or the cover tab is.
  const visualSpot = expectsMedia || tabs.some((tab) => tab.kind === 'cover')
  const sentEdits = buildSentEditIndex({
    requests: input.requests, version: item.version, tabs,
    visualKey: visualSpot ? visualTarget?.key ?? null : null,
    coverKey: coverTile?.target?.key ?? null,
    frameCount: visualTarget?.anchors ? preview?.frames.length ?? 0 : 0,
    visualWord: layout === 'pages' ? 'page' : 'frame',
  })

  const status = headerStatus({
    isPublished, publication: input.publication, schedule: input.schedule.targets, plannedDate: item.planned_date, layout,
  })
  const active = input.schedule.requests.find((r) => ['pending', 'applying', 'partially_applied'].includes(r.status))
  const removalPending = input.requests.some((r) => r.request_type === 'archive' && ['pending', 'applying'].includes(r.status))

  return {
    slug: input.slug,
    contentId: item.content_id,
    version: item.version,
    title: item.title,
    formatLabel: pieceFormatLabel(item.format, item.platforms ?? []),
    layout,
    tabs,
    updatedTabKeys: [...updated],
    updatedLine: reReview ? (updatedAreasLine(tabs, updated, changes.visualsChanged) || null) : null,
    beforeByBlock: reReview ? Object.fromEntries(changes.before) : {},
    reReview: reReview !== null,
    preview,
    previewRefreshUrl: preview ? `${input.previewRefreshBase}/${preview.id}` : null,
    fallbackMedia,
    episodeDriveUrl: layout === 'horizontal' && isHttps(item.drive_url) ? item.drive_url : null,
    mediaPending: expectsMedia && !preview && fallbackMedia.length === 0,
    visualTarget,
    cover,
    coverTile,
    status,
    approvedLabel: status.kind === 'scheduled' || status.kind === 'unconfirmed'
      ? `Approved · ${status.keyFact.charAt(0).toLowerCase()}${status.keyFact.slice(1)}`
      : 'Approved',
    postedLabel: status.kind === 'live' && status.postedLabel ? status.postedLabel : 'Posted',
    canRequestSchedule: capabilities.canManageSchedule && SCHEDULE_REQUEST_STATES.has(item.state),
    scheduleHasExternalTargets: input.schedule.targets.some((t) => t.required),
    activeScheduleRequest: active
      ? { kind: active.request_kind, when: active.requested_local ? displayRequestedLocal(active.requested_local) : null }
      : null,
    removal: capabilities.canSubmitRequests && !removalPending
      ? { slug: input.slug, contentId: item.content_id, idempotencyKey: input.removalKey }
      : null,
    canEdit: capabilities.canSubmitRequests && !isPublished && !revisionStarted,
    canDecide: capabilities.canDecide,
    canComment: capabilities.canComment,
    canSubmitRequests: capabilities.canSubmitRequests,
    isPublished,
    state: item.state,
    revisionStarted,
    sentSummary: { count: unresolved.length, dateLabel: firstSent ? torontoMonthDay(firstSent) : null },
    packageReady: readiness.ready,
    missing: readiness.missing,
    comments: input.comments,
    ledger: item.fact_check_ledger,
    factCheckScope: item.fact_check_scope,
    factCheckExemption: item.fact_check_exemption,
    requests: input.requests,
    requestMessages: input.requestMessages,
    sentEdits,
    item,
    showIntro: input.showIntro,
    backHref: input.backHref,
    backLabel: input.backLabel,
  }
}
