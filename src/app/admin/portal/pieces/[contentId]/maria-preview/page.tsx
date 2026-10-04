import { notFound, redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import PieceReviewScreen from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'
import PiecePageV2 from '@/app/client/[slug]/piece/[contentId]/v2/PiecePageV2'
import { getAgencyReviewPreviews } from '@/lib/portal/review-previews'
import { loadClientPiecePreview } from './preview-data'
import ReadOnlyPreview from './ReadOnlyPreview'

export const dynamic = 'force-dynamic'

export default async function MariaPiecePreviewPage({ params, searchParams }: {
  params: Promise<{ contentId: string }>
  searchParams: Promise<{ layout?: string }>
}) {
  const session = await verifySession()
  if (!session || session.role !== 'admin' || session.userId !== 'admin') {
    redirect('/admin/login')
  }
  const { contentId } = await params
  const decoded = decodeURIComponent(contentId)
  const preview = await loadClientPiecePreview('kanset', decoded)
  if (!preview) notFound()
  const { layout } = await searchParams
  if (layout === 'v2') {
    const previews = await getAgencyReviewPreviews(preview.item.id, preview.item.version).catch(() => [])
    return (
      <ReadOnlyPreview>
        <div style={{ padding: '12px 32px 0', fontFamily: 'var(--dot-font-text)', color: 'var(--dot-graphite)', fontSize: 13 }}>
          Exact permissions loaded from {preview.seatName}&apos;s live portal seat. New piece page (plan 4).
        </div>
        <PiecePageV2
          mode="preview"
          slug={preview.slug}
          item={preview.item}
          comments={preview.comments}
          schedule={preview.schedule}
          publication={preview.publication}
          requests={preview.requests}
          requestMessages={preview.requestMessages}
          reviewAssets={preview.reviewAssets}
          previews={previews}
          capabilities={preview.capabilities}
          showIntro={false}
          backHref={`/admin/portal/pieces/${encodeURIComponent(decoded)}`}
          backLabel="Back to Agency Ops"
          previewRefreshBase="/api/admin/portal/review-previews"
          draftScope={`read-only-preview:${preview.seatName}`}
          serverDrafts={null}
          ticks={[]}
        />
      </ReadOnlyPreview>
    )
  }

  return (
    <ReadOnlyPreview>
      <div style={{
        padding: '12px 32px 0', fontFamily: 'var(--dot-font-text)',
        color: 'var(--dot-graphite)', fontSize: 13,
      }}>
        Exact permissions loaded from {preview.seatName}&apos;s live portal seat.
      </div>
      <PieceReviewScreen
        slug={preview.slug}
        item={preview.item}
        comments={preview.comments}
        schedule={preview.schedule}
        publication={preview.publication}
        requests={preview.requests}
        requestMessages={preview.requestMessages}
        reviewAssets={preview.reviewAssets}
        capabilities={preview.capabilities}
        draftScope={`read-only-preview:${preview.seatName}`}
        showReviewIntro={false}
        backHref={`/admin/portal/pieces/${encodeURIComponent(decoded)}`}
        backLabel="Back to Agency Ops"
      />
    </ReadOnlyPreview>
  )
}
