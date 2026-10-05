import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { loadAgencyStagePiece } from '@/lib/portal/gates-loader'
import { deriveContentStage, resolveNineGates, type StagePiece } from '@/lib/portal/gates'
import {
  gateDots, gateSummary, mariaViewLine, versionRows, type GateDot, type VersionRow,
} from '@/lib/portal/agency-ops-core'
import { getLatestFeedback, getPieceRequestContext, type FeedbackSummary } from '@/lib/portal/agency-ops'
import { getAgencyReviewDrafts } from '@/lib/portal/review-drafts'
import { getAgencyReviewPreviews } from '@/lib/portal/review-previews'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import { deriveWorkspaceData } from '@/app/client/[slug]/piece/[contentId]/v2/derive'
import { usesPiecePageV2 } from '@/lib/portal/piece-page/piece-page-switch'
import { PREVIEW_SEAT_EMAIL, loadClientPiecePreview, type ClientPiecePreviewData } from './maria-preview/preview-data'
import { loadAdminComments, loadRequests, type AdminComment } from '../../data'
import type { AdminContentRequest } from '../../RequestAdmin'
import { resolvePieceClient } from './piece-client'
import { stageDisplay } from '../../GatesAdmin'
import {
  buildRequestViews, reviewTickCount, stateBarLine, summarizeDrafts,
  type AgencyRequestView, type DraftLike, type DraftSeatSummary, type TickCount,
} from './agency-piece-data-view'

export { buildRequestViews, summarizeDrafts, unsentAlertSentence } from './agency-piece-data-view'
export type { AgencyRequestView, DraftSeatSummary, RequestThumb } from './agency-piece-data-view'

export type AgencyReviewAsset = {
  id: string; label: string; channel: string; asset_kind: string; url: string
  caption_status: string; review_note: string | null
}
const ASSET_COLUMNS = 'id, label, channel, asset_kind, url, caption_status, review_note'

export type AgencyPieceData = {
  contentId: string
  // The piece's own client, carried on every link out of the page.
  clientSlug: string
  piece: StagePiece
  stageLabel: string
  gates: GateDot[]
  gatesSummary: string
  versions: VersionRow[]
  requestViews: AgencyRequestView[]
  requests: AdminContentRequest[]
  comments: AdminComment[]
  reviewAssets: AgencyReviewAsset[]
  // The working version's assets when it is ahead of what Maria sees, to check before release.
  workingAssets: { version: number; assets: AgencyReviewAsset[] } | null
  previews: SignedReviewPreview[]
  previewError: string | null
  // Amended 2026-10-03: Anastasia's no-media override for the version Maria sees (0092), if any. Shown as an
  // informational line, read-only; it also silences the My Tasks alert for that version.
  mediaOverride: string | null
  design: { canva: string | null; drive: string | null }
  working: { blocks: Array<{ key: string | null; label: string; body: string }>; clientBody: string | null }
  drafts: DraftSeatSummary[]
  feedback: FeedbackSummary | null
  mariaPreview: ClientPiecePreviewData | null
  mariaPreviewError: string | null
  // The piece page layout her seat has today (PORTAL_PIECE_PAGE_V2), so the centre shows what she sees.
  mariaLayout: 'v1' | 'v2'
  // Maria's own server ticks (0094) on the version she sees, shown read-only in the agency view.
  mariaTicks: string[]
  reviewTicks: TickCount | null
  mariaView: string
  barLine: string
  plannedDate: string | null
  todayIso: string
  nowIso: string
}

const https = (value: string | null | undefined) => (value && /^https:\/\//i.test(value) ? value : null)
function torontoToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// A content_id two clients share, with no ?client= to settle it: the page offers the choice.
export type AmbiguousAgencyPiece = { ambiguous: true; contentId: string; clients: Array<{ slug: string; name: string }> }

export async function loadAgencyPieceData(
  contentId: string, clientHint?: string | null,
): Promise<AgencyPieceData | AmbiguousAgencyPiece | null> {
  const admin = createSupabaseAdmin()
  // Resolve the piece's own client, then keep every read scoped to it.
  const resolved = await resolvePieceClient(admin, contentId, clientHint)
  if (resolved.kind === 'missing') return null
  if (resolved.kind === 'ambiguous') return { ambiguous: true, contentId, clients: resolved.clients }
  const { clientId, slug: clientSlug } = resolved
  const piece = await loadAgencyStagePiece(admin, clientId, contentId)
  if (!piece) return null
  const itemRow = await admin.from('content_items').select('id, working_version, client_visible_version, planned_date')
    .eq('client_id', clientId).eq('content_id', contentId).single()
  if (itemRow.error || !itemRow.data) return null
  const item = itemRow.data as { id: string; working_version: number | null; client_visible_version: number | null; planned_date: string | null }
  const shownVersion = item.client_visible_version ?? item.working_version
  const aheadVersion = item.working_version != null && shownVersion != null && item.working_version > shownVersion
    ? item.working_version : null

  const [workingRow, designRow, assetRows, workingAssetRows, comments, requests, context, drafts, seats, feedback] = await Promise.all([
    item.working_version != null
      ? admin.from('content_item_versions').select('copy_blocks, client_body, canva_url, drive_url')
        .eq('content_item_id', item.id).eq('version', item.working_version).single()
      : Promise.resolve({ data: null, error: null }),
    admin.from('content_design_links').select('canva_url, drive_url')
      .eq('client_id', clientId).eq('content_item_id', item.id).maybeSingle(),
    shownVersion != null
      ? admin.from('content_review_assets').select(ASSET_COLUMNS)
        .eq('client_id', clientId).eq('content_item_id', item.id).eq('content_version', shownVersion)
        .order('channel').order('asset_key')
      : Promise.resolve({ data: [], error: null }),
    aheadVersion != null
      ? admin.from('content_review_assets').select(ASSET_COLUMNS)
        .eq('client_id', clientId).eq('content_item_id', item.id).eq('content_version', aheadVersion)
        .order('channel').order('asset_key')
      : Promise.resolve({ data: [], error: null }),
    loadAdminComments({ clientId, contentUuid: item.id }),
    loadRequests({ clientId, contentUuid: item.id }),
    getPieceRequestContext(clientId, item.id),
    getAgencyReviewDrafts(item.id),
    // client_users has no service-role grant; the seat list comes through the agency RPC.
    admin.rpc('list_portal_access'),
    getLatestFeedback(clientId, 1),
  ])
  const failure = designRow.error ?? assetRows.error ?? workingAssetRows.error ?? seats.error
  if (failure) throw new Error(`Agency piece data unavailable: ${failure.message}`)

  // Previews are a convenience on this page: a storage hiccup must not take the page down.
  let previews: SignedReviewPreview[] = []
  let previewError: string | null = null
  const versionsNeeded = new Set<number>()
  if (shownVersion != null) versionsNeeded.add(shownVersion)
  for (const request of requests) {
    if (request.edit && request.edit.targetKind !== 'copy_block' && request.baseVersion != null) versionsNeeded.add(request.baseVersion)
  }
  try {
    previews = (await Promise.all([...versionsNeeded].slice(0, 4).map((version) => getAgencyReviewPreviews(item.id, version)))).flat()
  } catch (error) {
    previewError = error instanceof Error ? error.message : String(error)
  }
  const shownPreviews = previews.filter((preview) => preview.contentVersion === shownVersion)

  let mariaPreview: ClientPiecePreviewData | null = null
  let mariaPreviewError: string | null = null
  if (piece.released) {
    try {
      mariaPreview = await loadClientPiecePreview(clientSlug, contentId)
    } catch (error) {
      mariaPreviewError = error instanceof Error ? error.message : String(error)
    }
  }

  // Her ticks for the version she sees. A failed read shows no count rather than a wrong one, and a
  // seat still on the current page (no ticks there) shows none.
  const mariaLayout: 'v1' | 'v2' = usesPiecePageV2(PREVIEW_SEAT_EMAIL) ? 'v2' : 'v1'
  let mariaTicks: string[] = []
  let tabKeys: string[] = []
  if (mariaLayout === 'v2' && mariaPreview?.seatUserId) {
    const tickRows = await admin.from('content_review_tab_ticks').select('tab_key')
      .eq('client_id', clientId).eq('auth_user_id', mariaPreview.seatUserId)
      .eq('content_item_id', item.id).eq('content_version', mariaPreview.item.version)
    if (!tickRows.error) {
      mariaTicks = ((tickRows.data ?? []) as Array<{ tab_key: string }>).map((row) => row.tab_key)
      tabKeys = deriveWorkspaceData({
        slug: mariaPreview.slug, item: mariaPreview.item, comments: mariaPreview.comments,
        schedule: mariaPreview.schedule, publication: mariaPreview.publication, requests: mariaPreview.requests,
        requestMessages: mariaPreview.requestMessages, reviewAssets: mariaPreview.reviewAssets, previews: shownPreviews,
        capabilities: mariaPreview.capabilities, showIntro: false, backHref: '', backLabel: '',
        previewRefreshBase: '/api/admin/portal/review-previews', removalKey: 'agency-view',
        seatRequestIds: mariaPreview.seatRequestIds,
      }).tabs.map((tab) => tab.key)
    }
  }

  const overrideRow = shownVersion != null
    ? await admin.from('content_release_media_overrides').select('reason')
      .eq('client_id', clientId).eq('content_item_id', item.id).eq('content_version', shownVersion).maybeSingle()
    : { data: null, error: null }
  if (overrideRow.error) throw new Error(`Agency piece data unavailable: ${overrideRow.error.message}`)

  const seatNames = new Map(((seats.data ?? []) as Array<{ client_id: string; auth_user_id: string; name: string | null }>)
    .filter((seat) => seat.client_id === clientId)
    .map((seat) => [seat.auth_user_id, seat.name?.trim() || 'Client']))
  const draftSummary = summarizeDrafts(drafts as unknown as DraftLike[], seatNames)
  const working = workingRow.data as { copy_blocks: unknown; client_body: string | null; canva_url: string | null; drive_url: string | null } | null
  const design = designRow.data as { canva_url: string | null; drive_url: string | null } | null
  const dots = gateDots(resolveNineGates(piece))
  const stage = deriveContentStage(piece)
  const display = stageDisplay(stage.stage, stage.label)
  const openEdits = requests.filter((request) => request.requestType === 'edit'
    && ['pending', 'applying', 'prepared', 'conflicted'].includes(request.status)).length
  // ContentStage has no 'live': posted pieces are done, posted_unverified or legacy.
  const published = stage.stage === 'done' || stage.stage === 'posted_unverified' || stage.stage === 'legacy'
  const mariaView = mariaViewLine({
    released: Boolean(piece.released), decision: piece.currentDecision,
    unsentCount: draftSummary.reduce((sum, seat) => sum + seat.unsentCount, 0),
    openEditCount: openEdits, published,
  })
  // Ticks matter only while she is reviewing: not once she has approved or the piece is live.
  const reviewTicks = mariaPreview && tabKeys.length > 0 && !published && piece.currentDecision !== 'approved'
    ? reviewTickCount(tabKeys, mariaTicks) : null
  const now = new Date()

  return {
    contentId,
    clientSlug,
    piece,
    stageLabel: [display.label, display.detail].filter(Boolean).join(' · '),
    gates: dots,
    gatesSummary: gateSummary(dots),
    versions: versionRows(context.versions, item.working_version, item.client_visible_version),
    requestViews: buildRequestViews(requests, context, previews),
    requests,
    comments,
    reviewAssets: (assetRows.data ?? []) as AgencyReviewAsset[],
    workingAssets: aheadVersion != null
      ? { version: aheadVersion, assets: (workingAssetRows.data ?? []) as AgencyReviewAsset[] } : null,
    previews: shownPreviews,
    previewError,
    mediaOverride: (overrideRow.data as { reason: string } | null)?.reason ?? null,
    design: { canva: https(design?.canva_url ?? working?.canva_url), drive: https(design?.drive_url ?? working?.drive_url) },
    working: {
      blocks: Array.isArray(working?.copy_blocks) ? working!.copy_blocks as AgencyPieceData['working']['blocks'] : [],
      clientBody: working?.client_body ?? null,
    },
    drafts: draftSummary,
    feedback: feedback[0] ?? null,
    mariaPreview,
    mariaPreviewError,
    mariaLayout,
    mariaTicks,
    reviewTicks,
    mariaView,
    barLine: stateBarLine(mariaView, reviewTicks),
    plannedDate: item.planned_date,
    todayIso: torontoToday(now),
    nowIso: now.toISOString(),
  }
}
