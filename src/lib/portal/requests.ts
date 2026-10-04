import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'
export { isUnresolvedContentRequest, UNRESOLVED_CONTENT_REQUEST_STATUSES } from './request-status'
export {
  clientRequestLabel, contentRequestTarget,
  type ContentRequestMessage, type ContentRequestRow, type ContentRequestStatus, type ContentRequestTargetKind,
} from './request-target'
import type { ContentRequestMessage, ContentRequestRow, ContentRequestStatus } from './request-target'

const SELECT = 'id, client_id, content_id, request_type, base_version, payload, status, requester_name, created_at, updated_at, reconciled_at, reconciled_by, canonical_version, resolution_note, canonical_content_key'
const STATUSES = new Set<ContentRequestStatus>([
  'pending', 'applying', 'prepared', 'applied', 'conflicted', 'rejected', 'superseded',
  'answered',
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
  const requests = (data ?? []).map(mapRequest)
  const editRequestIds = requests
    .filter((request) => request.request_type === 'edit')
    .map((request) => request.id)
  if (!editRequestIds.length) return requests.map((request) => ({ ...request, base_copy_text: null }))
  const { data: baseCopies, error: baseCopyError } = await supabase.rpc(
    'get_content_request_base_copies',
    { p_request_ids: editRequestIds },
  )
  if (baseCopyError) throw new PortalDataError(baseCopyError.message)
  const baseCopyByRequest = new Map<string, string>()
  for (const value of baseCopies ?? []) {
    if (!value || typeof value !== 'object') continue
    const row = value as Record<string, unknown>
    if (typeof row.request_id === 'string' && typeof row.base_copy === 'string') {
      baseCopyByRequest.set(row.request_id, row.base_copy)
    }
  }
  return requests.map((request) => ({
    ...request,
    base_copy_text: baseCopyByRequest.get(request.id) ?? null,
  }))
}

export async function getContentRequestMessages(
  clientId: string,
  requestIds: string[],
): Promise<ContentRequestMessage[]> {
  if (!requestIds.length) return []
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_change_request_messages')
    .select('id,request_id,author_type,author_name,body,created_at')
    .eq('client_id', clientId)
    .in('request_id', requestIds)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []).flatMap((value) => {
    const row = value as Partial<ContentRequestMessage>
    if (!row.id || !row.request_id || !row.author_name || !row.body
        || !row.created_at || (row.author_type !== 'client' && row.author_type !== 'anastasia')) return []
    return [row as ContentRequestMessage]
  })
}
