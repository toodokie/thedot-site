import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { CONTENT_SELECT, mapContentRow, PortalDataError, type ContentRow } from '@/lib/portal/data'
import type { CommentRow } from '@/lib/portal/comments'
import type { ScheduleRequestRow, ScheduleTargetRow } from '@/lib/portal/schedule'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ContentRequestMessage, ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { PieceReviewCapabilities } from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'

const REQUEST_SELECT = 'id, client_id, content_id, request_type, base_version, payload, status, requester_name, created_at, updated_at, reconciled_at, reconciled_by, canonical_version, resolution_note, canonical_content_key'

type CopyBlock = { key?: unknown; body?: unknown }

function baseCopy(blocks: unknown, blockKey: unknown): string | null {
  if (!Array.isArray(blocks) || typeof blockKey !== 'string') return null
  const block = (blocks as CopyBlock[]).find((candidate) => candidate.key === blockKey)
  return typeof block?.body === 'string' ? block.body : null
}

export type ClientPiecePreviewData = {
  clientId: string
  slug: string
  item: ContentRow
  comments: CommentRow[]
  schedule: { targets: ScheduleTargetRow[]; requests: ScheduleRequestRow[] }
  publication: PublicationTargetRow[]
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  reviewAssets: ReviewAsset[]
  seatName: string
  capabilities: PieceReviewCapabilities
}

export async function loadClientPiecePreview(
  slug: string,
  contentId: string,
): Promise<ClientPiecePreviewData | null> {
  const admin = createSupabaseAdmin()
  const client = await admin.from('clients').select('id,slug').eq('slug', slug).maybeSingle()
  if (client.error) throw new PortalDataError(client.error.message)
  if (!client.data) return null
  const clientId = client.data.id
  const clientSlug = client.data.slug

  const [itemResult, accessResult] = await Promise.all([
    admin.from('content_with_state').select(CONTENT_SELECT)
    .eq('client_id', clientId).eq('content_id', contentId).maybeSingle()
    , admin.rpc('list_portal_access'),
  ])
  if (itemResult.error) throw new PortalDataError(itemResult.error.message)
  if (accessResult.error) throw new PortalDataError(accessResult.error.message)
  if (!itemResult.data) return null
  const item = mapContentRow(itemResult.data)
  const maria = (accessResult.data ?? []).find((row: {
    client_id?: string; email?: string
  }) => row.client_id === clientId && row.email === 'maria@kanset.com') as {
    name?: string; can_decide?: boolean; can_comment?: boolean
    can_submit_requests?: boolean; can_manage_schedule?: boolean
  } | undefined
  if (!maria) throw new PortalDataError('Maria portal seat is unavailable')

  const [commentsResult, scheduleTargetsResult, scheduleRequestsResult, publicationResult,
    requestsResult, requestMessagesResult, assetsResult] = await Promise.all([
    admin.from('comments')
      .select('id, content_version, copy_block_key, author_type, author_name, body, quoted_text, target_kind, target_url, reply_to_comment_id, resolved, created_at')
      .eq('client_id', clientId).eq('content_id', item.id)
      .order('created_at', { ascending: true }).order('id', { ascending: true }),
    admin.from('content_schedule_targets_client')
      .select('id, content_id, content_version, destination, required, scheduled_at, status, verified_at, verification_label')
      .eq('client_id', clientId).eq('content_id', item.id).eq('content_version', item.version)
      .order('destination', { ascending: true }),
    admin.from('content_schedule_requests_client')
      .select('id, content_id, content_version, request_kind, requested_for, requested_local, requested_timezone, requested_utc_offset_minutes, status, client_message, created_at, resolved_at')
      .eq('client_id', clientId).eq('content_id', item.id).eq('content_version', item.version)
      .order('created_at', { ascending: false }),
    admin.from('content_publication_targets_client')
      .select('id, content_id, content_version, destination, required, expected_visibility, status, live_url, published_at, first_verified_at, last_verified_at, reconciliation_status, verification_label, current_provider_state, current_visibility, observed_at')
      .eq('client_id', clientId).eq('content_id', item.id).eq('content_version', item.version)
      .order('destination', { ascending: true }),
    admin.from('content_change_requests_client').select(REQUEST_SELECT)
      .eq('client_id', clientId).eq('content_id', item.id)
      .order('created_at', { ascending: false }).order('id', { ascending: false }),
    admin.from('content_change_request_messages')
      .select('id,request_id,author_type,author_name,body,created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }),
    admin.from('content_review_assets')
      .select('id, content_version, asset_key, label, channel, asset_kind, url, width_px, height_px, caption_status, review_note')
      .eq('client_id', clientId).eq('content_item_id', item.id)
      .eq('content_version', item.version).order('channel').order('asset_key'),
  ])
  const failure = commentsResult.error ?? scheduleTargetsResult.error ?? scheduleRequestsResult.error
    ?? publicationResult.error ?? requestsResult.error ?? requestMessagesResult.error ?? assetsResult.error
  if (failure) throw new PortalDataError(failure.message)

  const rawRequests = (requestsResult.data ?? []) as Array<Omit<ContentRequestRow, 'base_copy_text'>>
  const versionKeys = rawRequests.flatMap((request) => request.base_version == null
    ? [] : [{ version: request.base_version }])
  const versionsResult = versionKeys.length
    ? await admin.from('content_item_versions').select('version,copy_blocks')
      .eq('client_id', clientId).eq('content_item_id', item.id)
      .in('version', [...new Set(versionKeys.map((entry) => entry.version))])
    : { data: [], error: null }
  if (versionsResult.error) throw new PortalDataError(versionsResult.error.message)
  const blocksByVersion = new Map((versionsResult.data ?? []).map((version) => [
    version.version, version.copy_blocks,
  ]))
  const requests = rawRequests.map((request) => ({
    ...request,
    base_copy_text: request.request_type === 'edit' && request.base_version != null
      ? baseCopy(blocksByVersion.get(request.base_version), request.payload.block_key)
      : null,
  })) as ContentRequestRow[]
  const requestIds = new Set(requests.map((request) => request.id))
  const requestMessages = (requestMessagesResult.data ?? [])
    .filter((message) => requestIds.has(message.request_id)) as ContentRequestMessage[]

  return {
    clientId,
    slug: clientSlug,
    item,
    comments: (commentsResult.data ?? []) as CommentRow[],
    schedule: {
      targets: (scheduleTargetsResult.data ?? []) as ScheduleTargetRow[],
      requests: (scheduleRequestsResult.data ?? []) as ScheduleRequestRow[],
    },
    publication: (publicationResult.data ?? []) as PublicationTargetRow[],
    requests,
    requestMessages,
    reviewAssets: (assetsResult.data ?? []) as ReviewAsset[],
    seatName: maria.name ?? 'Maria Guerts',
    capabilities: {
      canDecide: maria.can_decide === true,
      canComment: maria.can_comment === true,
      canSubmitRequests: maria.can_submit_requests === true,
      canManageSchedule: maria.can_manage_schedule === true,
    },
  }
}
