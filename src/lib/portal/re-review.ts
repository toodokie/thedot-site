import type { ContentRequestRow } from './requests'
import type { ClientState } from './state'

export type ReReviewContext = {
  previousVersion: number
  changeCount: number
  changedAreas: string[]
}

function changedArea(request: ContentRequestRow): string {
  const block = typeof request.payload.block_key === 'string' ? request.payload.block_key : ''
  if (['ig-caption', 'fb-caption', 'ig-facebook-caption', 'social-caption'].includes(block)) return 'social caption'
  if (block === 'graphic') return 'graphic'
  if (['design', 'canva', 'drive'].includes(block)) return 'design'
  return 'review package'
}

// A new release is a re-review only when the client has already given feedback that
// was resolved into this exact version. Do not infer this from a version number alone:
// versions also advance for agency-only corrections and first releases.
export function reReviewContext(
  version: number,
  state: ClientState,
  requests: ContentRequestRow[],
): ReReviewContext | null {
  if (state !== 'needs_review') return null

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
  }
}
