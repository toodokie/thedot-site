import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getComments } from '@/lib/portal/comments'
import { getScheduleDetails } from '@/lib/portal/schedule'
import { getPublicationDetails } from '@/lib/portal/publication'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import { getReviewAssets } from '@/lib/portal/review-assets'
import { getMyReviewDrafts } from '@/lib/portal/review-drafts'
import { getClientReviewPreviews } from '@/lib/portal/review-previews'
import { getMyReviewTicks } from '@/lib/portal/piece-page/review-ticks'
import { getMySeatRequestIds } from '@/lib/portal/piece-page/seat-requests'
import { usesPiecePageV2 } from '@/lib/portal/piece-page/piece-page-switch'
import { PIECE_PAGE_INTRO_KEY, REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'
import { FEEDBACK_PROMPT_KEY } from '@/lib/portal/portal-feedback'
import { createSupabaseServer } from '@/lib/supabase/server'
import PieceReviewScreen from './PieceReviewScreen'
import PiecePageV2 from './v2/PiecePageV2'
import { getPieceItem, resolvePieceMetadata } from './piece-metadata'

export async function generateMetadata({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}): Promise<Metadata> {
  const { slug, contentId } = await params
  return resolvePieceMetadata(slug, contentId)
}

export default async function Piece({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getPieceItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)
  const v2 = usesPiecePageV2(session.email)
  const supabase = await createSupabaseServer()
  const [comments, schedule, publication, requests, reviewAssets, acknowledgment, serverDrafts] = await Promise.all([
    getComments(session.clientId, item.id),
    getScheduleDetails(session.clientId, item.id, item.version),
    getPublicationDetails(session.clientId, item.id, item.version),
    getContentRequests(session.clientId, item.id),
    getReviewAssets(session.clientId, item.id, item.version),
    supabase.from('portal_announcement_acknowledgments').select('acknowledged_at')
      .eq('client_id', session.clientId)
      .eq('announcement_key', v2 ? PIECE_PAGE_INTRO_KEY : REVIEW_FLOW_ANNOUNCEMENT_KEY)
      .maybeSingle(),
    // A seat that cannot send edits has no drafts to sync. null keeps the page browser-only.
    session.canSubmitRequests ? getMyReviewDrafts(item.id) : Promise.resolve(null),
  ])
  const requestMessages = await getContentRequestMessages(
    session.clientId,
    requests.map((request) => request.id),
  )

  if (v2) {
    const [previews, ticks, seatRequestIds, feedback] = await Promise.all([
      // A preview read failure falls back to the Drive buttons; it never fails the page.
      getClientReviewPreviews(session.clientId, item.id, item.version).catch((error: unknown) => {
        console.error('review previews unavailable', error)
        return []
      }),
      getMyReviewTicks(item.id, item.version),
      // Fails closed to no ids: no sent markers rather than every seat's.
      getMySeatRequestIds(session.clientId, item.id, session.userId),
      // RLS (0095) returns only this seat's own answer.
      supabase.from('portal_feedback_responses').select('created_at')
        .eq('client_id', session.clientId).eq('prompt_key', FEEDBACK_PROMPT_KEY).maybeSingle(),
    ])
    // Plan 5 decisions 3 and 4: the card waits until the rollout note (the first-visit intro) is on
    // record, and stops once she answers. Either read failing hides the card rather than risk
    // asking twice or stacking it on the note.
    const showFeedback = Boolean(acknowledgment.data) && !acknowledgment.error && !feedback.error && !feedback.data
    return <PiecePageV2
      mode="client"
      slug={slug}
      item={item}
      comments={comments}
      schedule={schedule}
      publication={publication}
      requests={requests}
      requestMessages={requestMessages}
      reviewAssets={reviewAssets}
      previews={previews}
      capabilities={session}
      showIntro={!acknowledgment.data}
      backHref={`/client/${slug}`}
      backLabel="Back to calendar"
      previewRefreshBase={`/api/client/${slug}/review-previews`}
      draftScope={session.userId}
      serverDrafts={serverDrafts}
      ticks={ticks}
      seatRequestIds={seatRequestIds}
      feedback={showFeedback ? { contentItemId: item.id } : null}
    />
  }

  return <PieceReviewScreen
    slug={slug}
    item={item}
    comments={comments}
    schedule={schedule}
    publication={publication}
    requests={requests}
    requestMessages={requestMessages}
    reviewAssets={reviewAssets}
    capabilities={session}
    draftScope={session.userId}
    showReviewIntro={!acknowledgment.data}
    serverDrafts={serverDrafts}
    backHref={`/client/${slug}`}
  />
}
