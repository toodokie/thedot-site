import { createSupabaseServer } from '@/lib/supabase/server'
import type { FactCheckLedgerEntry, FactCheckScope } from './frontmatter'
import { parseClientState, type ClientState, type ContentStatus } from './state'

export class PortalDataError extends Error {}

export type ContentRow = {
  id: string; content_id: string; title: string; format: string | null; pillar: string | null
  platforms: string[]; status: ContentStatus; planned_date: string | null; schedule_state: ScheduleState
  publication_state: PublicationState
  canva_url: string | null
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

const SELECT = 'id, content_id, title, format, pillar, platforms, status, planned_date, schedule_state, publication_state, canva_url, client_body, copy_blocks, fact_check, fact_check_scope, fact_check_exemption, fact_check_ledger, version, current_decision, client_state'

function mapContentRow(value: unknown): ContentRow {
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

// The pre-ledger fixture rows are deleted by migration 0019's provenance-checked demo
// purge; this module needs no app-side exclusion list (the temporary RETIRED_FIXTURES
// guard was removed in the same round that ships the purge).

export async function getContent(clientId: string): Promise<ContentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId)
    .order('planned_date', { ascending: true, nullsFirst: false })
    .order('content_id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).map(mapContentRow)
}
export async function getContentItem(clientId: string, contentId: string): Promise<ContentRow | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId).eq('content_id', contentId).maybeSingle()
  if (error) throw new PortalDataError(error.message)
  if (!data) return null
  return mapContentRow(data)
}
export async function getActivity(clientId: string): Promise<ActivityRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('activity_log').select('id, event_type, title, summary, actor_type, actor_name, created_at')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30)
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as ActivityRow[]
}
