import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'
import type { ContentStatus } from './state'

// Read model for the Calendar + Plan surfaces. Mirrors data.ts (createSupabaseServer,
// the content_with_state view, PortalDataError on failure) but selects only the columns the
// scheduling views need. Rows with a null scheduled_date ARE returned; callers bucket them
// as "unscheduled" so nothing silently drops off the calendar.

export type ScheduleRow = {
  id: string
  content_id: string
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  status: ContentStatus
  scheduled_date: string | null
}

const SELECT = 'id, content_id, title, format, pillar, platforms, status, scheduled_date'

export async function getSchedule(clientId: string): Promise<ScheduleRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .order('content_id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  // Normalise platforms to a real array so callers never guard against null.
  return (data ?? []).map((r: any) => ({ ...r, platforms: r.platforms ?? [] })) as ScheduleRow[]
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
