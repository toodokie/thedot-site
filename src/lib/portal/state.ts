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
