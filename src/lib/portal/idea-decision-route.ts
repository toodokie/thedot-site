export function ideaDecisionReturnPath(slug: string, contentId: string): string {
  return `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(contentId)}`
}
