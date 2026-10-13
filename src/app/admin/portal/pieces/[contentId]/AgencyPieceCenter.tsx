import type { ReactNode } from 'react'
import PieceReviewScreen from '@/app/client/[slug]/piece/[contentId]/PieceReviewScreen'
import PiecePageV2 from '@/app/client/[slug]/piece/[contentId]/v2/PiecePageV2'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'
import type { OptionPick } from '@/lib/portal/review-asset-options'
import ReadOnlyPreview from './maria-preview/ReadOnlyPreview'
import type { ClientPiecePreviewData } from './maria-preview/preview-data'
import styles from './agency-panel.module.css'

// The ONLY admin file that renders the client piece layout (spec 8: one component tree, so the
// agency view cannot drift from Maria's). It shows the layout her seat has: plan 4's page in
// 'agency' mode (read-only, her server ticks shown and never written, the agency bar in place of
// her decision bar), or the current page inside ReadOnlyPreview while her seat is not switched.
export default function AgencyPieceCenter({ contentId, preview, layout, previews, ticks, optionPicks = [], fallback, sidePanel, bottomBar }: {
  contentId: string
  preview: ClientPiecePreviewData | null
  layout: 'v1' | 'v2'
  previews: SignedReviewPreview[]
  ticks: string[]
  // Maria's cover picks (0098) on the version she sees, shown read-only as "Chosen".
  optionPicks?: OptionPick[]
  fallback: ReactNode
  sidePanel: ReactNode
  bottomBar: ReactNode
}) {
  const backHref = adminPieceHref(contentId, preview?.slug)
  let centre: ReactNode = <>{fallback}{bottomBar}</>
  if (preview && layout === 'v2') {
    centre = <PiecePageV2
      mode="agency"
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
      backLabel="Agency Ops"
      previewRefreshBase="/api/admin/portal/review-previews"
      draftScope={`agency-view:${preview.seatName}`}
      serverDrafts={null}
      ticks={ticks}
      seatRequestIds={preview.seatRequestIds}
      optionPicks={optionPicks}
      bottomBar={bottomBar}
    />
  } else if (preview) {
    centre = <>
      <ReadOnlyPreview>
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
          draftScope={`agency-view:${preview.seatName}`}
          showReviewIntro={false}
          backHref={backHref}
          backLabel="Agency Ops"
        />
      </ReadOnlyPreview>
      {bottomBar}
    </>
  }
  return <div className={styles.layout}>
    <div className={styles.centre}>{centre}</div>
    {sidePanel}
  </div>
}
