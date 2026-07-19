import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'
import type { ContentStatus } from './state'
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
  planned_date: string | null
  schedule_state: ScheduleState
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

const SELECT = 'id, content_id, title, format, pillar, platforms, status, planned_date, schedule_state'

export async function getSchedule(clientId: string): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId)
    .order('planned_date', { ascending: true, nullsFirst: false })
    .order('content_id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  // Normalise platforms to a real array so callers never guard against null.
  return (data ?? []).map((value) => {
    const row = value as unknown as Record<string, unknown>
    return { ...row, platforms: Array.isArray(row.platforms) ? row.platforms : [] }
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

// A PRODUCED piece (approved, scheduled, posted) has a client-facing piece page; a PLANNED
// piece (idea, draft) only has a plan subpage. The calendar and plan lists route accordingly.
export function isProduced(status: string): boolean {
  return status === 'approved' || status === 'scheduled' || status === 'posted'
}

export type StatusAccent = 'yellow' | 'graphite' | 'grey'

// Colour bucket for a status chip: yellow = in planning (idea, draft, awaiting),
// graphite = locked (approved, scheduled), grey = published (posted).
export function statusAccent(status: string): StatusAccent {
  if (status === 'posted') return 'grey'
  if (status === 'scheduled' || status === 'approved') return 'graphite'
  return 'yellow'
}
