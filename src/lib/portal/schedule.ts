import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'
import { parseClientState, type ContentStatus, type ClientState } from './state'
import type { ScheduleState } from './data'

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
const SELECT = 'id, content_id, title, format, pillar, platforms, status, client_state, planned_date, version, calendar_note, schedule_state'

export async function getSchedule(clientId: string): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServer()
  const [contentResult, calendarResult] = await Promise.all([
    supabase.from('content_calendar_client').select(SELECT).eq('client_id', clientId)
      .order('planned_date', { ascending: true, nullsFirst: false }).order('content_id', { ascending: true }),
    supabase.from('calendar_events_client')
      .select('content_id,content_version,event_html_link,sync_status,sync_label,event_role')
      .eq('client_id', clientId).eq('event_role','editorial_plan'),
  ])
  if (contentResult.error) throw new PortalDataError(contentResult.error.message)
  if (calendarResult.error) throw new PortalDataError(calendarResult.error.message)
  const calendarMap = new Map((calendarResult.data ?? []).map((row) => [`${row.content_id}:${row.content_version}`,row]))
  // Normalise platforms to a real array so callers never guard against null.
  return (contentResult.data ?? []).map((value) => {
    const row = value as unknown as Record<string, unknown>
    const calendar = calendarMap.get(`${row.id}:${row.version}`)
    // Validate client_state instead of trusting the raw DB string (Codex review 2026-07-21):
    // an unexpected state used to route fail-open to the piece page and could crash a later
    // getContentItem. parseClientState throws PortalDataError-adjacent on an unknown value.
    return { ...row, client_state: parseClientState(row.client_state),
      platforms: Array.isArray(row.platforms) ? row.platforms : [],
      calendar_note: typeof row.calendar_note === 'string' ? row.calendar_note : null,
      calendar_sync_status: calendar?.sync_status ?? null,
      calendar_sync_label: calendar?.sync_label ?? null,
      calendar_event_link: calendar?.event_html_link ?? null }
  }) as unknown as ScheduleRow[]
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
export function routesToPiecePage(clientState: string): boolean {
  return clientState !== 'with_dot'
}

// The Plan list is the quiet pipeline only: unproduced rows genuinely still with The
// Dot. A released-for-review piece (needs_review) belongs to the approval surfaces and
// must never render under "before they come to you for approval".
export function belongsOnPlanSurface(status: string, clientState: string): boolean {
  return (status === 'idea' || status === 'draft') && clientState === 'with_dot'
}

export type StatusAccent = 'yellow' | 'graphite' | 'grey'

// Colour bucket for a status chip: yellow = in planning (idea, draft, awaiting),
// graphite = locked (approved, scheduled), grey = published (posted).
export function statusAccent(status: string): StatusAccent {
  if (status === 'posted') return 'grey'
  if (status === 'scheduled' || status === 'approved') return 'graphite'
  return 'yellow'
}
