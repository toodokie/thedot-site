import { createSupabaseServer } from '@/lib/supabase/server'
import { parseClientState, type ClientState, type ContentStatus } from './state'

export class PortalDataError extends Error {}

export type ContentRow = {
  id: string; content_id: string; title: string; format: string | null; pillar: string | null
  platforms: string[]; status: ContentStatus; scheduled_date: string | null; canva_url: string | null
  client_body: string | null; fact_check: string | null; version: number; current_decision: string | null
  copy_blocks: { key: string; label: string; body: string }[]
  state: ClientState
}
export type ActivityRow = {
  id: string; event_type: string; title: string; summary: string | null
  actor_type: string; actor_name: string; created_at: string
}

const SELECT = 'id, content_id, title, format, pillar, platforms, status, scheduled_date, canva_url, client_body, copy_blocks, fact_check, version, current_decision, client_state'

function mapContentRow(value: unknown): ContentRow {
  if (!value || typeof value !== 'object') throw new PortalDataError('Invalid content row')
  const row = value as Record<string, unknown>
  return { ...row, state: parseClientState(row.client_state) } as unknown as ContentRow
}

export async function getContent(clientId: string): Promise<ContentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_with_state').select(SELECT)
    .eq('client_id', clientId)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
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
