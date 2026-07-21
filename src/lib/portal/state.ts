export type ContentStatus = 'idea' | 'draft' | 'approved' | 'scheduled' | 'posted'
export type CurrentDecision = 'approved' | 'change_requested' | null
export type ClientState =
  | 'needs_review'
  | 'with_dot'
  | 'approved'
  | 'partially_scheduled'
  | 'schedule_failed'
  | 'scheduled'
  | 'reschedule_pending'
  | 'cancel_pending'
  | 'partially_live'
  | 'publish_failed'
  | 'live'
  | 'archived'

const CLIENT_STATES = new Set<ClientState>([
  'needs_review', 'with_dot', 'approved', 'partially_scheduled', 'schedule_failed',
  'scheduled', 'reschedule_pending', 'cancel_pending', 'partially_live',
  'publish_failed', 'live', 'archived',
])

// State precedence is a database invariant. TypeScript validates the view result but never derives
// a second, potentially divergent state from status/decision fields.
export function parseClientState(value: unknown): ClientState {
  if (typeof value !== 'string' || !CLIENT_STATES.has(value as ClientState)) {
    throw new Error(`Unknown client state: ${String(value)}`)
  }
  return value as ClientState
}

// Client wording for every state (audit B4): a raw enum token never renders in client
// prose. Each label completes the sentence "This piece is ___." Exhaustive over
// ClientState, so a new state fails the type check instead of leaking a token.
const CLIENT_STATE_LABELS: Record<ClientState, string> = {
  needs_review: 'waiting for your review',
  with_dot: 'back with The Dot',
  approved: 'approved',
  partially_scheduled: 'scheduled on some platforms (the rest are being confirmed)',
  schedule_failed: 'having a scheduling issue (The Dot is on it)',
  scheduled: 'scheduled',
  reschedule_pending: 'being rescheduled',
  cancel_pending: 'coming off the schedule',
  partially_live: 'posted (some platforms verified)',
  publish_failed: 'having a posting issue (The Dot is on it)',
  live: 'posted',
  archived: 'archived',
}

export function clientStateLabel(state: ClientState): string {
  return CLIENT_STATE_LABELS[state]
}
