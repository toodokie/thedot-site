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
  const block = typeof request.payload.block_key === 'string' ? request.payload.block_key : ''
  if (['ig-caption', 'fb-caption', 'ig-facebook-caption', 'social-caption'].includes(block)) return 'social caption'
  if (['reel-script', 'onscreen-script'].includes(block)) return 'on-screen reel copy'
  if (['graphic', 'carousel', 'carousel-copy'].includes(block)) return 'graphic copy'
  if (['youtube-package', 'youtube-short'].includes(block)) return 'YouTube copy'
  if (['linkedin-caption', 'linkedin-first-comment'].includes(block)) return 'LinkedIn copy'
  if (['article-body', 'article-seo'].includes(block)) return 'website article'
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
