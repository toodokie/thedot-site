import type { ContentRequestRow } from './requests'
import type { ClientState } from './state'

export type ReReviewContext = {
  previousVersion: number
  changeCount: number
  changedAreas: string[]
  mode: 'decision' | 'released'
}

const RELEASED_WITHOUT_CLIENT_DECISION = new Set<ClientState>([
  'approved',
  'partially_scheduled',
  'schedule_failed',
  'scheduled',
  'reschedule_pending',
  'cancel_pending',
  'partially_live',
  'publish_failed',
  'live',
])

function changedArea(request: ContentRequestRow): string {
  const kind = typeof request.payload.target_kind === 'string' ? request.payload.target_kind : 'copy_block'
  const block = typeof request.payload.target_key === 'string'
    ? request.payload.target_key
    : typeof request.payload.block_key === 'string' ? request.payload.block_key : ''
  if (kind === 'design_link') return 'design'
  if (kind === 'asset') {
    if (['social-cover', 'social-teaser', 'youtube-cover'].includes(block)) return 'episode assets'
    if (block === 'website-cover') return 'website article'
    return 'visual assets'
  }
  if (['ig-caption', 'fb-caption', 'ig-facebook-caption', 'social-caption'].includes(block)) return 'social caption'
  if (['reel-script', 'onscreen-script'].includes(block)) return 'on-screen reel copy'
  if (['graphic', 'carousel', 'carousel-copy'].includes(block)) return 'graphic copy'
  if (['youtube-package', 'youtube-short', 'youtube-title', 'youtube-description', 'youtube-tags'].includes(block)) return 'YouTube copy'
  if (['linkedin-caption', 'linkedin-first-comment'].includes(block)) return 'LinkedIn copy'
  if (['article-body', 'article-seo', 'website-cover'].includes(block)) return 'website article'
  if (['social-cover', 'social-teaser', 'youtube-cover'].includes(block)) return 'episode assets'
  if (block === 'story') return 'Story copy'
  if (['design', 'canva', 'drive'].includes(block)) return 'design'
  return 'review package'
}

// A new release is a re-review only when the client has already given feedback that
// was resolved into this exact version. Do not infer this from a version number alone:
// versions also advance for agency-only corrections and first releases.
export function reReviewContext(
  version: number,
  state: ClientState,
  currentDecision: string | null,
  requests: ContentRequestRow[],
): ReReviewContext | null {
  const mode = state === 'needs_review'
    ? 'decision'
    : currentDecision === null && RELEASED_WITHOUT_CLIENT_DECISION.has(state)
      ? 'released'
      : null
  if (!mode) return null

  const appliedToThisVersion = requests.filter((request) =>
    request.request_type === 'edit'
    && request.base_version !== null
    && request.base_version < version
    && request.canonical_version === version
    && ['applied', 'superseded'].includes(request.status),
  )
  if (!appliedToThisVersion.length) return null

  return {
    previousVersion: Math.max(...appliedToThisVersion.map((request) => request.base_version as number)),
    changeCount: appliedToThisVersion.length,
    changedAreas: [...new Set(appliedToThisVersion.map(changedArea))],
    mode,
  }
}
