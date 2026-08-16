import { randomUUID } from 'node:crypto'
import type { CSSProperties } from 'react'
import type { ClientSession } from '@/lib/portal/auth'
import type { ContentRow } from '@/lib/portal/data'
import type { CommentRow } from '@/lib/portal/comments'
import type { ScheduleRequestRow, ScheduleTargetRow } from '@/lib/portal/schedule'
import type { PublicationTargetRow } from '@/lib/portal/publication'
import type { ContentRequestMessage, ContentRequestRow } from '@/lib/portal/requests'
import type { ReviewAsset } from '@/lib/portal/review-assets'
import { Eyebrow, Heading, Text, Button } from '@thedot/design-system'
import ReviewPackage from './ReviewPackage'
import CommentThread from './CommentThread'
import FactCheckEvidence from '../../FactCheckEvidence'
import SchedulePanel from './SchedulePanel'
import PublicationPanel from './PublicationPanel'
import RequestHistory from '../../requests/RequestHistory'
import RemovalRequestForm from './RemovalRequestForm'
import ProgressBar from '@/components/portal/ProgressBar'
import { clientProgress } from '@/lib/portal/progress-bar-model'
import { reReviewContext } from '@/lib/portal/re-review'
import { contentReviewPackageReadiness } from '@/lib/portal/podcast-review'
import ReviewAssets from './ReviewAssets'
import ReviewDraftProvider from './ReviewDraftProvider'
import ReviewVerdict from './ReviewVerdict'
import SuggestEditForm from './SuggestEditForm'
import { contentRequestTarget, isUnresolvedContentRequest } from '@/lib/portal/requests'
import styles from './piece-review.module.css'
import ReviewFlowIntro from './ReviewFlowIntro'

const chip: CSSProperties = {
  fontFamily: 'var(--dot-font-text)', fontSize: 11, color: 'var(--dot-graphite)',
  border: '1px solid var(--dot-hairline)', background: 'transparent', padding: '2px 8px',
  textTransform: 'capitalize', letterSpacing: '0.01em', lineHeight: 1.5,
}
const chipFact: CSSProperties = {
  ...chip, color: 'var(--dot-black)', background: 'var(--dot-yellow-pale)', borderColor: 'transparent',
}
function listAreas(areas: string[]): string {
  if (areas.length < 2) return areas[0] ?? 'review package'
  if (areas.length === 2) return `${areas[0]} and ${areas[1]}`
  return `${areas.slice(0, -1).join(', ')}, and ${areas.at(-1)}`
}

export type PieceReviewCapabilities = Pick<ClientSession,
  'canDecide' | 'canComment' | 'canSubmitRequests' | 'canManageSchedule'>

export default function PieceReviewScreen({
  slug,
  item,
  comments,
  schedule,
  publication,
  requests,
  requestMessages,
  reviewAssets,
  capabilities,
  backHref,
  backLabel = 'Back',
  draftScope,
  showReviewIntro,
}: {
  slug: string
  item: ContentRow
  comments: CommentRow[]
  schedule: { targets: ScheduleTargetRow[]; requests: ScheduleRequestRow[] }
  publication: PublicationTargetRow[]
  requests: ContentRequestRow[]
  requestMessages: ContentRequestMessage[]
  reviewAssets: ReviewAsset[]
  capabilities: PieceReviewCapabilities
  backHref: string
  backLabel?: string
  draftScope: string
  showReviewIntro: boolean
}) {
  const reReview = reReviewContext(item.version, item.state, item.current_decision, requests)
  const progress = clientProgress({
    clientState: item.state,
    scheduleTargets: schedule.targets.map((target) => ({
      destination: target.destination, status: target.status,
    })),
    publicationTargets: publication.map((target) => ({
      destination: target.destination, status: target.status,
    })),
  })
  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Caption', body: item.client_body }] : [])
  const isPublished = publication.some((target) => target.status === 'live')
    || ['live', 'partially_live'].includes(item.state)
  const designLinks = [
    item.canva_url && /^https:\/\//i.test(item.canva_url)
      ? { key: 'canva', label: 'Canva', url: item.canva_url } : null,
    item.drive_url && /^https:\/\//i.test(item.drive_url)
      ? { key: 'drive', label: 'Google Drive', url: item.drive_url } : null,
  ].filter((link): link is { key: 'canva' | 'drive'; label: string; url: string } => Boolean(link))
  const readiness = contentReviewPackageReadiness(
    { ...item, copy_blocks: blocks },
    reviewAssets,
  )
  const finalDecisionAvailable = item.state === 'needs_review' && readiness.ready
  const unresolvedEdits = requests.flatMap((request) => {
    if (request.base_version !== item.version || !isUnresolvedContentRequest(request.status)) return []
    const target = contentRequestTarget(request)
    return target ? [{ id: request.id, label: target.label, status: request.status }] : []
  })
  const revisionStarted = unresolvedEdits.some((request) => ['applying', 'prepared'].includes(request.status))
  const canEditBlocks = capabilities.canSubmitRequests && !isPublished && !revisionStarted

  return (
    <div className={styles.wrap}>
      <ReviewFlowIntro slug={slug} show={showReviewIntro} />
      <Button as="a" href={backHref} variant="ghost" size="sm">{backLabel}</Button>

      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <Heading level={3} as="h1">{item.title}</Heading>
      </div>

      <div style={{ marginBottom: 24 }}>
        <ProgressBar model={progress} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {(item.platforms || []).map((platform) => <span key={platform} style={chip}>{platform}</span>)}
        <span style={chip}>v{item.version}</span>
        {item.fact_check && <span style={chipFact}>
          {item.fact_check === 'confirmed' ? 'fact-checked' : item.fact_check}
        </span>}
        {reReview && <span style={chip}>updated after your feedback</span>}
      </div>

      {reReview && <section aria-labelledby="re-review-heading" style={{
        marginBottom: 28, padding: '20px', border: '1px solid var(--dot-hairline)',
        background: 'var(--dot-yellow-pale)',
      }}>
        <Eyebrow tone="grey">{reReview.mode === 'decision' ? 'Updated for re-review' : 'Updated after your feedback'}</Eyebrow>
        <div id="re-review-heading" style={{ marginTop: 8 }}>
          <Heading level={3}>We updated this after your feedback.</Heading>
        </div>
        <Text tone="graphite">
          We updated the {listAreas(reReview.changedAreas)}. This is version {item.version}, updated
          from version {reReview.previousVersion}. {reReview.mode === 'decision'
            ? 'Please review the current package. Edit anything else that should change, or approve it when ready.'
            : 'This updated package is the current released version.'}
        </Text>
      </section>}

      <nav aria-label="Review package sections" className={styles.sectionNav}>
        <span style={{ color: 'var(--dot-grey)', fontSize: 13 }}>Jump to:</span>
        <a href="#review-copy">Copy</a>
        {reviewAssets.length > 0 && <a href="#review-assets">Assets</a>}
        {designLinks.length > 0 && <a href="#review-design">Design</a>}
        <a href="#review-comments">Conversation</a>
        <a href="#review-facts">Facts</a>
        {!isPublished && <a href="#review-decision">Finish review</a>}
      </nav>

      <ReviewDraftProvider draftScope={draftScope} slug={slug} contentId={item.content_id} version={item.version}>
      <ReviewPackage
        blocks={blocks}
        platforms={item.platforms || []}
        canRequest={canEditBlocks}
        isPublished={isPublished}
        finalDecisionAvailable={finalDecisionAvailable}
      />

      {reviewAssets.length > 0 && <ReviewAssets
        assets={reviewAssets}
        canRequest={canEditBlocks}
      />}

      {designLinks.length > 0 && <section id="review-design" aria-labelledby="review-design-heading" style={{
        marginBottom: 28, padding: '20px', border: '1px solid var(--dot-hairline)',
        background: 'var(--dot-cream)',
      }}>
        <div id="review-design-heading"><Heading level={3}>Design review</Heading></div>
        <Text tone="graphite">Open the current design. If it should change, describe the change beside that link.</Text>
        {designLinks.map((link, index) => <div key={link.key} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }}>
          <Button as="a" href={link.url} target="_blank" rel="noreferrer" variant={index === 0 ? 'yellow' : 'ghost'} size="sm">Open {link.label}</Button>
          {canEditBlocks && <SuggestEditForm targetKind="design_link"
            targetKey={link.key} targetLabel={`${link.label} design`} urlSnapshot={link.url} />}
        </div>)}
      </section>}

      <div id="review-comments">
        <CommentThread slug={slug} contentId={item.content_id} comments={comments}
          canComment={capabilities.canComment} />
      </div>

      <div id="review-facts"><FactCheckEvidence item={item} /></div>

      <ReviewVerdict slug={slug} contentId={item.content_id} contentVersion={item.version}
        isPublished={isPublished} needsReview={item.state === 'needs_review'}
        packageReady={readiness.ready} missing={readiness.missing}
        sentEdits={unresolvedEdits} revisionStarted={revisionStarted}
        canDecide={capabilities.canDecide} />
      </ReviewDraftProvider>

      {requests.length > 0 && <details style={{ marginTop: 28, marginBottom: 28 }}>
        <summary style={{ cursor: 'pointer', fontFamily: 'var(--dot-font-display)', fontWeight: 600 }}>
          Edit history and replies ({requests.length})
        </summary>
        <div style={{ marginTop: 16 }}>
          <RequestHistory slug={slug} requests={requests} messages={requestMessages} content={[item]}
            canReply={capabilities.canSubmitRequests} />
        </div>
      </details>}

      <SchedulePanel
        slug={slug}
        contentId={item.content_id}
        plannedDate={item.planned_date}
        targets={schedule.targets}
        requests={schedule.requests}
        canRequest={capabilities.canManageSchedule
          && ['approved', 'partially_scheduled', 'schedule_failed', 'scheduled'].includes(item.state)}
      />

      <PublicationPanel targets={publication} />

      {capabilities.canSubmitRequests
        && !requests.some((request) => request.request_type === 'archive'
          && ['pending', 'applying'].includes(request.status))
        && <section aria-label="Removal options" style={{ marginTop: 28 }}>
          <RemovalRequestForm slug={slug} contentId={item.content_id} idempotencyKey={randomUUID()} />
        </section>}
    </div>
  )
}
