import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import type { CSSProperties } from 'react'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { getComments } from '@/lib/portal/comments'
import { Heading, Text, Button } from '@thedot/design-system'
import DecideForm from './DecideForm'
import ReviewPackage from './ReviewPackage'
import CommentThread from './CommentThread'
import FactCheckEvidence from '../../FactCheckEvidence'
import { getScheduleDetails } from '@/lib/portal/schedule'
import SchedulePanel from './SchedulePanel'
import { getPublicationDetails } from '@/lib/portal/publication'
import PublicationPanel from './PublicationPanel'
import { getContentRequestMessages, getContentRequests } from '@/lib/portal/requests'
import RequestHistory from '../../requests/RequestHistory'
import RemovalRequestForm from './RemovalRequestForm'
import ProgressBar from '@/components/portal/ProgressBar'
import { clientProgress } from '@/lib/portal/progress-bar-model'

const chip: CSSProperties = {
  fontFamily: 'var(--dot-font-text)', fontSize: 11, color: 'var(--dot-graphite)',
  border: '1px solid var(--dot-hairline)', background: 'transparent', padding: '2px 8px',
  textTransform: 'capitalize', letterSpacing: '0.01em', lineHeight: 1.5,
}
const chipFact: CSSProperties = {
  ...chip, color: 'var(--dot-black)', background: 'var(--dot-yellow-pale)', borderColor: 'transparent',
}
const sectionLink: CSSProperties = {
  color: 'var(--dot-graphite)',
  fontFamily: 'var(--dot-font-text)',
  fontSize: 13,
  textDecoration: 'underline',
  textUnderlineOffset: 4,
  textDecorationColor: 'var(--dot-hairline)',
}

export default async function Piece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) redirect(`/client/${slug}`)
  const [comments, schedule, publication, requests] = await Promise.all([
    getComments(session.clientId, item.id),
    getScheduleDetails(session.clientId, item.id, item.version),
    getPublicationDetails(session.clientId, item.id, item.version),
    getContentRequests(session.clientId, item.id),
  ])
  const requestMessages = await getContentRequestMessages(
    session.clientId, requests.map((request) => request.id),
  )

  const progress = clientProgress({
    clientState: item.state,
    scheduleTargets: schedule.targets.map((t) => ({ destination: t.destination, status: t.status })),
    publicationTargets: publication.map((t) => ({ destination: t.destination, status: t.status })),
  })

  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Caption', body: item.client_body }] : [])
  // A first verified live destination locks this exact version. Do not offer an edit
  // form that would create a request the agency cannot safely apply to shipped work.
  // Maria can still use the durable comment thread to ask for a correction or follow-up.
  const isPublished = publication.some((target) => target.status === 'live')
    || ['live', 'partially_live'].includes(item.state)
  const designLinks = [
    item.canva_url && /^https:\/\//i.test(item.canva_url) ? { label: 'Canva', url: item.canva_url } : null,
    item.drive_url && /^https:\/\//i.test(item.drive_url) ? { label: 'Google Drive', url: item.drive_url } : null,
  ].filter((link): link is { label: string; url: string } => Boolean(link))

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px' }}>
      <Button as="a" href={`/client/${slug}`} variant="ghost" size="sm">Back</Button>

      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <Heading level={3}>{item.title}</Heading>
      </div>

      <div style={{ marginBottom: 24 }}>
        <ProgressBar model={progress} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {(item.platforms || []).map((p) => <span key={p} style={chip}>{p}</span>)}
        <span style={chip}>v{item.version}</span>
        {/* 'confirmed' is OUR fact-check gate, not the client's approval; same wording
            ruling as the Overview chip (Anastasia, 2026-07-20) */}
        {item.fact_check && <span style={chipFact}>
          {item.fact_check === 'confirmed' ? 'fact-checked' : item.fact_check}
        </span>}
      </div>

      <nav aria-label="Review package sections" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 14px', marginBottom: 28 }}>
        <span style={{ color: 'var(--dot-grey)', fontSize: 13 }}>Jump to:</span>
        <a href="#review-copy" style={sectionLink}>Copy</a>
        {designLinks.length > 0 && <a href="#review-design" style={sectionLink}>Design</a>}
        <a href="#review-facts" style={sectionLink}>Facts</a>
        <a href="#review-comments" style={sectionLink}>Comments</a>
        {item.state === 'needs_review' && <a href="#review-decision" style={sectionLink}>Decision</a>}
      </nav>

      <ReviewPackage
        blocks={blocks}
        platforms={item.platforms || []}
        slug={slug}
        contentId={item.content_id}
        canRequest={session.canSubmitRequests && !isPublished}
        isPublished={isPublished}
      />

      {designLinks.length > 0 && <section id="review-design" aria-labelledby="review-design-heading" style={{
        marginBottom: 28, padding: '20px', border: '1px solid var(--dot-hairline)', background: 'var(--dot-cream)',
      }}>
        <Heading level={3} id="review-design-heading">Design review</Heading>
        <Text tone="graphite">Open the current design, then return here to leave a design comment for The Dot. Approving the package below approves this linked design and its copy together.</Text>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {designLinks.map((link, index) => <Button key={link.url} as="a" href={link.url} target="_blank" rel="noreferrer"
            variant={index === 0 ? 'yellow' : 'ghost'} size="sm">Open {link.label}</Button>)}
          <Button as="a" href="#review-comments" variant="ghost" size="sm">Leave design feedback</Button>
        </div>
      </section>}

      {requests.length > 0 && <section style={{ marginBottom: 28 }}>
        <Heading level={3}>Requests for this piece</Heading>
        <RequestHistory slug={slug} requests={requests} messages={requestMessages} content={[item]}
          canReply={session.canSubmitRequests} />
      </section>}

      <div id="review-facts">
        <FactCheckEvidence item={item} />
      </div>

      <div id="review-comments">
        <CommentThread slug={slug} contentId={item.content_id} comments={comments}
        canComment={session.canComment}
        designLinks={designLinks} />
      </div>

      {/* The progress bar under the title carries the state. This remains one atomic
          decision for the immutable released version, after copy, design, facts, and
          comments have all been available for review. */}
      {item.state === 'needs_review' && <section id="review-decision" aria-labelledby="review-decision-heading" style={{
        marginTop: 32, padding: '20px', border: '1px solid var(--dot-black)', background: 'var(--dot-cream)',
      }}>
        <Heading level={3} id="review-decision-heading">{session.canDecide ? 'Your decision' : 'Package decision'}</Heading>
        {session.canDecide
          ? <DecideForm slug={slug} contentId={item.content_id} />
          : <Text tone="grey">Only Maria, the primary decision-maker, can approve this package or request changes. Your comments are still part of the review.</Text>}
      </section>}

      <SchedulePanel
        slug={slug}
        contentId={item.content_id}
        plannedDate={item.planned_date}
        targets={schedule.targets}
        requests={schedule.requests}
        canRequest={session.canManageSchedule
          && ['approved', 'partially_scheduled', 'schedule_failed', 'scheduled'].includes(item.state)}
      />

      <PublicationPanel targets={publication} />

      {session.canSubmitRequests
        && !requests.some((request) => request.request_type === 'archive'
          && ['pending', 'applying'].includes(request.status))
        && <section style={{ marginTop: 36 }}>
          <Heading level={3}>Request removal</Heading>
          <Text tone="grey">The piece stays in the portal until The Dot reviews and applies the request.</Text>
          <RemovalRequestForm slug={slug} contentId={item.content_id} idempotencyKey={randomUUID()} />
        </section>}
    </div>
  )
}
