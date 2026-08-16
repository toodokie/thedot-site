export const UNRESOLVED_CONTENT_REQUEST_STATUSES = [
  'pending',
  'applying',
  'prepared',
  'conflicted',
] as const

const unresolved = new Set<string>(UNRESOLVED_CONTENT_REQUEST_STATUSES)

export function isUnresolvedContentRequest(status: string): boolean {
  return unresolved.has(status)
}
