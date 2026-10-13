import { randomUUID } from 'node:crypto'
import type { ReactNode } from 'react'
import type { ServerDraftRow } from '@/lib/portal/review-drafts-core'
import FeedbackCard from '../FeedbackCard'
import PieceWorkspace from './PieceWorkspace'
import { deriveWorkspaceData, type DeriveInput, type WorkspaceMode } from './derive'

export type PiecePageV2Props = Omit<DeriveInput, 'removalKey'> & {
  mode: WorkspaceMode
  draftScope: string
  serverDrafts: ServerDraftRow[] | null
  ticks: string[]
  // Agency mode only: the bar shown in place of her decision bar.
  bottomBar?: ReactNode
  // Plan 5 feedback card: set by the client page only (note read, no answer yet). Mounted only in
  // client mode, so the admin preview and the agency view can never submit it.
  feedback?: { contentItemId: string | null } | null
}

// Server component: derives the page once per request, then hands serialisable data to the
// client workspace.
export default function PiecePageV2({ mode, draftScope, serverDrafts, ticks, bottomBar, feedback, ...input }: PiecePageV2Props) {
  const data = deriveWorkspaceData({ ...input, removalKey: randomUUID() })
  return <>
    <PieceWorkspace data={data} mode={mode} draftScope={draftScope} serverDrafts={serverDrafts} ticks={ticks}
      bottomBar={bottomBar} />
    {mode === 'client' && feedback ? <FeedbackCard slug={input.slug} contentItemId={feedback.contentItemId} /> : null}
  </>
}
