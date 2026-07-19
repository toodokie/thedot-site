import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'

export type ContentRequestStatus =
  | 'pending' | 'applying' | 'prepared' | 'applied'
  | 'conflicted' | 'rejected' | 'superseded'

export type ContentRequestRow = {
  id: string
  client_id: string
  content_id: string | null
  request_type: 'edit' | 'create' | 'archive'
  base_version: number | null
  payload: Record<string, unknown>
  status: ContentRequestStatus
  requester_name: string
  created_at: string
  updated_at: string
  reconciled_at: string | null
  reconciled_by: string | null
  canonical_version: number | null
  resolution_note: string | null
  canonical_content_key: string | null
}

const SELECT = 'id, client_id, content_id, request_type, base_version, payload, status, requester_name, created_at, updated_at, reconciled_at, reconciled_by, canonical_version, resolution_note, canonical_content_key'
const STATUSES = new Set<ContentRequestStatus>([
  'pending', 'applying', 'prepared', 'applied', 'conflicted', 'rejected', 'superseded',
])

function mapRequest(value: unknown): ContentRequestRow {
  if (!value || typeof value !== 'object') throw new PortalDataError('Invalid content request row')
  const row = value as Record<string, unknown>
  if (!['edit', 'create', 'archive'].includes(String(row.request_type))
      || !STATUSES.has(row.status as ContentRequestStatus)
      || !row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    throw new PortalDataError('Invalid content request state')
  }
  return row as unknown as ContentRequestRow
}

export async function getContentRequests(
  clientId: string,
  contentUuid?: string,
): Promise<ContentRequestRow[]> {
  const supabase = await createSupabaseServer()
  let query = supabase.from('content_change_requests_client').select(SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (contentUuid) query = query.eq('content_id', contentUuid)
  const { data, error } = await query
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).map(mapRequest)
}

export function clientRequestLabel(status: ContentRequestStatus): string {
  if (status === 'pending') return 'Received'
  if (status === 'applying' || status === 'prepared') return 'In progress'
  if (status === 'applied') return 'Applied'
  if (status === 'rejected') return 'Not proceeding'
  if (status === 'conflicted') return 'Needs review'
  return 'Superseded'
}
