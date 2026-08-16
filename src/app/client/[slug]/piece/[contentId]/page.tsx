import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { getComments } from '@/lib/portal/comments'
import { getScheduleDetails } from '@/lib/portal/schedule'
import { getPublicationDetails } from '@/lib/portal/publication'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import { getReviewAssets } from '@/lib/portal/review-assets'
import PieceReviewScreen from './PieceReviewScreen'
import { createSupabaseServer } from '@/lib/supabase/server'
import { REVIEW_FLOW_ANNOUNCEMENT_KEY } from '@/lib/portal/review-flow-announcement'

export default async function Piece({ params }: {
  params: Promise<{ slug: string; contentId: string }>
}) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)
  const supabase = await createSupabaseServer()
  const [comments, schedule, publication, requests, reviewAssets, acknowledgment] = await Promise.all([
    getComments(session.clientId, item.id),
    getScheduleDetails(session.clientId, item.id, item.version),
    getPublicationDetails(session.clientId, item.id, item.version),
    getContentRequests(session.clientId, item.id),
    getReviewAssets(session.clientId, item.id, item.version),
    supabase.from('portal_announcement_acknowledgments').select('acknowledged_at')
      .eq('client_id', session.clientId)
      .eq('announcement_key', REVIEW_FLOW_ANNOUNCEMENT_KEY)
      .maybeSingle(),
  ])
  const requestMessages = await getContentRequestMessages(
    session.clientId,
    requests.map((request) => request.id),
  )

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
    backHref={`/client/${slug}`}
  />
}
