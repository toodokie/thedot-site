export type ContentStatus = 'idea' | 'draft' | 'approved' | 'scheduled' | 'posted'
export type CurrentDecision = 'approved' | 'change_requested' | null
export type ClientState = 'needs_review' | 'with_dot' | 'approved' | 'scheduled' | 'live' | 'idea'

export function deriveClientState(status: ContentStatus, currentDecision: CurrentDecision): ClientState {
  // An OPEN change request on the current version always wins. content_with_state only ever
  // surfaces the current-version decision (a.content_version = ci.version), so currentDecision is
  // never a stale old-version decision, and a live "change requested" must not be hidden behind a
  // lifecycle status (idea/approved/scheduled/posted).
  if (currentDecision === 'change_requested') return 'with_dot'
  // Otherwise lifecycle/publication status leads.
  if (status === 'posted') return 'live'
  if (status === 'scheduled') return 'scheduled'
  if (status === 'approved') return 'approved'
  if (status === 'idea') return 'idea'
  // Otherwise (draft): the client decision on the current version decides.
  if (status === 'draft') return currentDecision === 'approved' ? 'approved' : 'needs_review'
  // Fail loud on an unknown status instead of silently dropping it into the review queue.
  throw new Error(`Unknown content status: ${status}`)
}
