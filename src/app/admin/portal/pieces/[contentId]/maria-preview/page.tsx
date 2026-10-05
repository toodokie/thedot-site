import { notFound, redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import PieceReviewScreen from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'
import PiecePageV2 from '@/app/client/[slug]/piece/[contentId]/v2/PiecePageV2'
import { getAgencyReviewPreviews } from '@/lib/portal/review-previews'
import { usesPiecePageV2 } from '@/lib/portal/piece-page/piece-page-switch'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'
import { resolvePieceClient } from '../piece-client'
import { PREVIEW_SEAT_EMAIL, loadClientPiecePreview } from './preview-data'
import ReadOnlyPreview from './ReadOnlyPreview'

export const dynamic = 'force-dynamic'

export default async function MariaPiecePreviewPage({ params, searchParams }: {
  params: Promise<{ contentId: string }>
  searchParams: Promise<{ layout?: string; client?: string }>
}) {
  const session = await verifySession()
  if (!session || session.role !== 'admin' || session.userId !== 'admin') {
    redirect('/admin/login')
  }
  const { contentId } = await params
  const decoded = decodeURIComponent(contentId)
  const { layout, client } = await searchParams
  // The piece's own client; a shared content_id goes back to the piece page to choose.
  const resolved = await resolvePieceClient(createSupabaseAdmin(), decoded, client ?? null)
  if (resolved.kind === 'missing') notFound()
  if (resolved.kind === 'ambiguous') redirect(adminPieceHref(decoded))
  const preview = await loadClientPiecePreview(resolved.slug, decoded)
  if (!preview) notFound()
  const backHref = adminPieceHref(decoded, preview.slug)
  // Defaults to the layout her seat has today; ?layout=v1 or v2 forces one.
  if (layout === 'v2' || (layout !== 'v1' && usesPiecePageV2(PREVIEW_SEAT_EMAIL))) {
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
          backHref={backHref}
          backLabel="Back to Agency Ops"
          previewRefreshBase="/api/admin/portal/review-previews"
          draftScope={`read-only-preview:${preview.seatName}`}
          serverDrafts={null}
          ticks={[]}
          seatRequestIds={preview.seatRequestIds}
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
        backHref={backHref}
        backLabel="Back to Agency Ops"
      />
    </ReadOnlyPreview>
  )
}
