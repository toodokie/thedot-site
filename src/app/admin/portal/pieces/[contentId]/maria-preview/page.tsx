import { notFound, redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import PieceReviewScreen from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'
import { loadClientPiecePreview } from './preview-data'
import ReadOnlyPreview from './ReadOnlyPreview'

export const dynamic = 'force-dynamic'

export default async function MariaPiecePreviewPage({ params }: {
  params: Promise<{ contentId: string }>
}) {
  const session = await verifySession()
  if (!session || session.role !== 'admin' || session.userId !== 'admin') {
    redirect('/admin/login')
  }
  const { contentId } = await params
  const decoded = decodeURIComponent(contentId)
  const preview = await loadClientPiecePreview('kanset', decoded)
  if (!preview) notFound()

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
