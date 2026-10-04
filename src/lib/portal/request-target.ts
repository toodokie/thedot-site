// Types and pure helpers for content requests, safe to import from client components (the new
// piece page renders RequestHistory inside its client-side Questions drawer). requests.ts adds
// the server reads and re-exports everything here.

export type ContentRequestStatus =
  | 'pending' | 'applying' | 'prepared' | 'applied'
  | 'answered' | 'conflicted' | 'rejected' | 'superseded'

export type ContentRequestMessage = {
  id: string
  request_id: string
  author_type: 'client' | 'anastasia'
  author_name: string
  body: string
  created_at: string
}

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
  base_copy_text?: string | null
}

export type ContentRequestTargetKind = 'copy_block' | 'asset' | 'design_link'

export function contentRequestTarget(request: ContentRequestRow): {
  kind: ContentRequestTargetKind
  key: string
  label: string
  url: string | null
  proposedText: string
} | null {
  if (request.request_type !== 'edit') return null
  const payload = request.payload
  const legacyKey = typeof payload.block_key === 'string' ? payload.block_key : ''
  const rawKind = typeof payload.target_kind === 'string' ? payload.target_kind : 'copy_block'
  const key = typeof payload.target_key === 'string' ? payload.target_key : legacyKey
  if (!key || !['copy_block', 'asset', 'design_link'].includes(rawKind)) return null
  const kind = rawKind as ContentRequestTargetKind
  const proposedText = typeof payload.proposed_text === 'string' ? payload.proposed_text : ''
  const url = typeof payload.url_snapshot === 'string' ? payload.url_snapshot : null
  const label = typeof payload.target_label === 'string' && payload.target_label.trim()
    ? payload.target_label.trim()
    : kind === 'asset' ? key.replaceAll('-', ' ')
      : kind === 'design_link' ? `${key === 'canva' ? 'Canva' : 'Google Drive'} design`
        : key.replaceAll('-', ' ')
  return { kind, key, label, url, proposedText }
}

export function clientRequestLabel(status: ContentRequestStatus): string {
  if (status === 'pending') return 'Received'
  if (status === 'applying' || status === 'prepared') return 'In progress'
  if (status === 'applied') return 'Applied'
  if (status === 'answered') return 'Answered'
  if (status === 'rejected') return 'Not proceeding'
  if (status === 'conflicted') return 'Needs review'
  return 'Superseded'
}
