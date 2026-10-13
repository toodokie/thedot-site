import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'
import { parseClientState, type ContentStatus, type ClientState } from './state'
import type { ScheduleState } from './data'
import { getActivePlanCycles } from './plan-cycle'

// Read model for the Calendar + Plan surfaces. Mirrors data.ts (createSupabaseServer,
// the content_with_state view, PortalDataError on failure) but selects only the columns the
// scheduling views need. Rows with a null planned_date ARE returned; callers bucket them
// as "unscheduled" so nothing silently drops off the calendar.

export type ScheduleRow = {
  id: string
  content_id: string
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  status: ContentStatus
  client_state: ClientState
  planned_date: string | null
  calendar_note: string | null
  schedule_state: ScheduleState
  calendar_sync_status: string | null
  calendar_sync_label: string | null
  calendar_event_link: string | null
  // Whether the client has ever decided on this piece. Needed to tell a genuinely
  // unproduced row apart from one she reviewed and sent back; both read with_dot.
  current_decision: string | null
}

export type ScheduleTargetRow = {
  id: string
  content_id: string
  content_version: number
  destination: string
  required: boolean
  scheduled_at: string | null
  status: 'pending' | 'scheduled' | 'reschedule_pending' | 'cancel_pending' | 'cancelled' | 'failed'
  verified_at: string | null
  verification_label: string
}

export type ScheduleRequestRow = {
  id: string
  content_id: string
  content_version: number
  request_kind: 'reschedule' | 'cancel'
  requested_for: string | null
  requested_local: string | null
  requested_timezone: string
  requested_utc_offset_minutes: number | null
  status: 'pending' | 'applying' | 'partially_applied' | 'applied' | 'conflicted' | 'rejected'
  client_message: string | null
  created_at: string
  resolved_at: string | null
}

// The dedicated calendar view is the client boundary for this surface. It exposes the released
// snapshot plus calendar_note, and keeps this reader aligned with the column/grant contract added
// by the piece-architecture migration. `version` is required to join the safe Google-calendar
// projection to the exact released piece version.
export const CALENDAR_SELECT = 'id, content_id, title, format, pillar, platforms, status, client_state, planned_date, version, calendar_note, schedule_state'

// current_decision is NOT a column on the calendar view, only on content_with_state, which the
// client seat can also read (the piece page selects it there). Asking the calendar view for it
// threw "column does not exist" and took down every surface that reads this model: Overview,
// Calendar and Plan all rendered "Something went wrong loading your workspace". Fetch it from the
// view that has it instead of widening the calendar view's column contract.
export const DECISION_SELECT = 'id, current_decision'

export async function getSchedule(clientId: string): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServer()
  const [contentResult, decisionResult, calendarResult, activePlans] = await Promise.all([
    supabase.from('content_calendar_client').select(CALENDAR_SELECT).eq('client_id', clientId)
      .order('planned_date', { ascending: true, nullsFirst: false }).order('content_id', { ascending: true }),
    supabase.from('content_with_state').select(DECISION_SELECT).eq('client_id', clientId),
    supabase.from('calendar_events_client')
      .select('content_id,content_version,event_html_link,sync_status,sync_label,event_role')
      .eq('client_id', clientId).eq('event_role','editorial_plan'),
    getActivePlanCycles(clientId),
  ])
  if (contentResult.error) throw new PortalDataError(contentResult.error.message)
  if (decisionResult.error) throw new PortalDataError(decisionResult.error.message)
  if (calendarResult.error) throw new PortalDataError(calendarResult.error.message)
  const decisionMap = new Map((decisionResult.data ?? []).map((row) =>
    [row.id as string, (row.current_decision ?? null) as string | null]))
  const calendarMap = new Map((calendarResult.data ?? []).map((row) => [`${row.content_id}:${row.content_version}`,row]))
  // Normalise platforms to a real array so callers never guard against null.
  const released = (contentResult.data ?? []).map((value) => {
    const row = value as unknown as Record<string, unknown>
    const calendar = calendarMap.get(`${row.id}:${row.version}`)
    // Validate client_state instead of trusting the raw DB string (Codex review 2026-07-21):
    // an unexpected state used to route fail-open to the piece page and could crash a later
    // getContentItem. parseClientState throws PortalDataError-adjacent on an unknown value.
    return { ...row, client_state: parseClientState(row.client_state),
      current_decision: decisionMap.get(row.id as string) ?? null,
      platforms: Array.isArray(row.platforms) ? row.platforms : [],
      calendar_note: typeof row.calendar_note === 'string' ? row.calendar_note : null,
      calendar_sync_status: calendar?.sync_status ?? null,
      calendar_sync_label: calendar?.sync_label ?? null,
      calendar_event_link: calendar?.event_html_link ?? null }
  }) as unknown as ScheduleRow[]
  const releasedIds = new Set(released.map((row) => row.id))
  // A schedule can span more than one approved or submitted plan cycle. Deduplicate a
  // rolling item by its freshest plan snapshot so one identity cannot render twice.
  const activePlanItems = new Map<string, typeof activePlans[number]['items'][number]>()
  for (const { items } of activePlans) {
    for (const item of items) {
      const previous = activePlanItems.get(item.content_item_id)
      if (!previous || item.updated_at > previous.updated_at) activePlanItems.set(item.content_item_id, item)
    }
  }
  const ideas = [...activePlanItems.values()].flatMap((value) => {
    if (releasedIds.has(value.content_item_id)) return []
    return [{
      id: value.content_item_id,
      content_id: value.content_id,
      title: value.title,
      format: value.format,
      pillar: value.pillar,
      platforms: Array.isArray(value.platforms) ? value.platforms : [],
      status: 'idea' as const,
      client_state: 'with_dot' as const,
      planned_date: value.planned_date,
      calendar_note: value.direction_note,
      schedule_state: 'unverified' as const,
      calendar_sync_status: null,
      calendar_sync_label: null,
      calendar_event_link: null,
      current_decision: null,
    }]
  })
  return [...released, ...ideas].sort((a, b) =>
    (a.planned_date ?? '9999-12-31').localeCompare(b.planned_date ?? '9999-12-31')
      || a.content_id.localeCompare(b.content_id))
}

export async function getScheduleDetails(
  clientId: string,
  contentId: string,
  contentVersion: number,
): Promise<{ targets: ScheduleTargetRow[]; requests: ScheduleRequestRow[] }> {
  const supabase = await createSupabaseServer()
  const [targetResult, requestResult] = await Promise.all([
    supabase.from('content_schedule_targets_client')
      .select('id, content_id, content_version, destination, required, scheduled_at, status, verified_at, verification_label')
      .eq('client_id', clientId).eq('content_id', contentId).eq('content_version', contentVersion)
      .order('destination', { ascending: true }),
    supabase.from('content_schedule_requests_client')
      .select('id, content_id, content_version, request_kind, requested_for, requested_local, requested_timezone, requested_utc_offset_minutes, status, client_message, created_at, resolved_at')
      .eq('client_id', clientId).eq('content_id', contentId).eq('content_version', contentVersion)
      .order('created_at', { ascending: false }),
  ])
  if (targetResult.error) throw new PortalDataError(targetResult.error.message)
  if (requestResult.error) throw new PortalDataError(requestResult.error.message)
  return {
    targets: (targetResult.data ?? []) as ScheduleTargetRow[],
    requests: (requestResult.data ?? []) as ScheduleRequestRow[],
  }
}

// Client-view audit B1 (the two-door contradiction): the piece-vs-plan door routes on
// client_state, NEVER status. A released-for-review piece is status 'draft' AND
// client_state 'needs_review' at the same time; routing on status sent the client to a
// plan subpage saying "still in planning" while the Overview said the same piece was
// waiting on her. Every state except a quiet with_dot lands on the decidable piece page.
// Second fix, 2026-09-21. Routing on client_state alone had a hole: submitting edits
// flips a piece BACK to with_dot, which is correct (it has returned to us) but is the
// same flag the plan surface uses to mean "never produced". So the act of sending
// edits moved the client onto a page whose whole job is to say "still in planning",
// and her edits vanished from view. They were never lost, only unreachable.
// A piece she has decided on has been through review and never belongs on the plan
// surface again, whatever its current state.
export function routesToPiecePage(clientState: string, currentDecision?: string | null): boolean {
  if (currentDecision) return true
  return clientState !== 'with_dot'
}

// The Plan list is the quiet pipeline only: unproduced rows genuinely still with The
// Dot. A released-for-review piece (needs_review) belongs to the approval surfaces and
// must never render under "before they come to you for approval".
export function belongsOnPlanSurface(status: string, clientState: string): boolean {
  return (status === 'idea' || status === 'draft') && clientState === 'with_dot'
}

export type StatusAccent = 'with_dot' | 'awaiting_review' | 'committed' | 'published'

// Colour bucket for a workflow-state chip: yellow = in planning or review,
// graphite = approved or scheduled, grey = published. Client calendar callers pass
// client_state because the base content status can remain draft after audited schedule
// and publication evidence advances the derived workflow state.
export function statusAccent(state: string): StatusAccent {
  if (state === 'posted' || state === 'live' || state === 'partially_live' || state === 'archived') return 'published'
  if (state === 'scheduled' || state === 'approved' || state === 'partially_scheduled'
    || state === 'reschedule_pending' || state === 'cancel_pending') return 'committed'
  // Work the client has already sent back is NOT waiting on her. Collapsing these two into
  // one accent told her that pieces she had just reviewed were still awaiting her review.
  if (state === 'needs_review') return 'awaiting_review'
  return 'with_dot'
}
