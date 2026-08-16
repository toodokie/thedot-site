import { createSupabaseServer } from '@/lib/supabase/server'
import type { FactCheckLedgerEntry, FactCheckScope } from './frontmatter'
import { parseClientState, type ClientState, type ContentStatus } from './state'

export class PortalDataError extends Error {}

export type ContentRow = {
  id: string; content_id: string; title: string; format: string | null; pillar: string | null
  platforms: string[]; status: ContentStatus; planned_date: string | null; schedule_state: ScheduleState
  publication_state: PublicationState
  canva_url: string | null
  drive_url: string | null
  client_body: string | null; fact_check: string | null; version: number; current_decision: string | null
  fact_check_scope: FactCheckScope; fact_check_exemption: string | null
  fact_check_ledger: FactCheckLedgerEntry[]
  copy_blocks: { key: string; label: string; body: string }[]
  state: ClientState
}
export type ScheduleState =
  | 'unverified' | 'partially_scheduled' | 'scheduled'
  | 'reschedule_pending' | 'cancel_pending' | 'failed'
const SCHEDULE_STATES = new Set<ScheduleState>([
  'unverified', 'partially_scheduled', 'scheduled',
  'reschedule_pending', 'cancel_pending', 'failed',
])
export type PublicationState = 'unverified' | 'partially_live' | 'failed' | 'unavailable' | 'live'
const PUBLICATION_STATES = new Set<PublicationState>([
  'unverified', 'partially_live', 'failed', 'unavailable', 'live',
])
export type ActivityRow = {
  id: string; event_type: string; title: string; summary: string | null
  actor_type: string; actor_name: string; created_at: string
}

export const CONTENT_SELECT = 'id, content_id, title, format, pillar, platforms, status, planned_date, schedule_state, publication_state, canva_url, drive_url, client_body, copy_blocks, fact_check, fact_check_scope, fact_check_exemption, fact_check_ledger, version, current_decision, client_state'

export function mapContentRow(value: unknown): ContentRow {
  if (!value || typeof value !== 'object') throw new PortalDataError('Invalid content row')
  const row = value as Record<string, unknown>
  if (typeof row.schedule_state !== 'string'
      || !SCHEDULE_STATES.has(row.schedule_state as ScheduleState)) {
    throw new PortalDataError(`Invalid schedule state: ${String(row.schedule_state)}`)
  }
  if (typeof row.publication_state !== 'string'
      || !PUBLICATION_STATES.has(row.publication_state as PublicationState)) {
    throw new PortalDataError(`Invalid publication state: ${String(row.publication_state)}`)
  }
  return { ...row, state: parseClientState(row.client_state) } as unknown as ContentRow
}

// The pre-ledger fixture rows were deleted by migration 0019's provenance-checked purge, applied to
// prod 2026-07-21 and verified by read-back (zero fixture rows); the temporary app-side guard that
// covered the gap between deploy and migration is gone with that verification.

export async function getContent(clientId: string): Promise<ContentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(CONTENT_SELECT)
    .eq('client_id', clientId)
    .order('planned_date', { ascending: true, nullsFirst: false })
    .order('content_id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).map(mapContentRow)
}
export async function getContentItem(clientId: string, contentId: string): Promise<ContentRow | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(CONTENT_SELECT)
    .eq('client_id', clientId).eq('content_id', contentId).maybeSingle()
  if (error) throw new PortalDataError(error.message)
  if (!data) return null
  return mapContentRow(data)
}
// Pure-housekeeping event types never render in the CLIENT feed (audit C4): eleven
// "Design link updated" sync rows flooded the 30-row window and pushed the client's own
// recorded decisions off the first page. Her feed leads with decisions, releases, live
// confirmations, and reports. Agency-facing surfaces read activity_log directly and
// keep everything; the rows themselves are untouched.
const CLIENT_FEED_EXCLUDED_EVENTS = ['design_link_updated']

export async function getActivity(clientId: string): Promise<ActivityRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('activity_log').select('id, event_type, title, summary, actor_type, actor_name, created_at')
    .eq('client_id', clientId)
    .not('event_type', 'in', `(${CLIENT_FEED_EXCLUDED_EVENTS.join(',')})`)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30)
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as ActivityRow[]
}
