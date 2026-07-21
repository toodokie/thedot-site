import { redirect } from 'next/navigation'
import { randomUUID } from 'node:crypto'
import type { CSSProperties } from 'react'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { getComments } from '@/lib/portal/comments'
import { Heading, Text, Button } from '@thedot/design-system'
import DecideForm from './DecideForm'
import CopyBlock from './CopyBlock'
import CommentThread from './CommentThread'
import FactCheckEvidence from '../../FactCheckEvidence'
import { getScheduleDetails } from '@/lib/portal/schedule'
import SchedulePanel from './SchedulePanel'
import { getPublicationDetails } from '@/lib/portal/publication'
import PublicationPanel from './PublicationPanel'
import { getContentRequests } from '@/lib/portal/requests'
import RequestHistory from '../../requests/RequestHistory'
import RemovalRequestForm from './RemovalRequestForm'
import { clientStateLabel } from '@/lib/portal/state'

const chip: CSSProperties = {
  fontFamily: 'var(--dot-font-text)', fontSize: 11, color: 'var(--dot-graphite)',
  border: '1px solid var(--dot-hairline)', background: 'transparent', padding: '2px 8px',
  textTransform: 'capitalize', letterSpacing: '0.01em', lineHeight: 1.5,
}
const chipFact: CSSProperties = {
  ...chip, color: 'var(--dot-black)', background: 'var(--dot-yellow-pale)', borderColor: 'transparent',
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

  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Caption', body: item.client_body }] : [])

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px' }}>
      <Button as="a" href={`/client/${slug}`} variant="ghost" size="sm">Back</Button>

      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <Heading level={3}>{item.title}</Heading>
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

      {item.canva_url && /^https:\/\//i.test(item.canva_url) && (
        <div style={{ marginBottom: 24 }}>
          <Button as="a" href={item.canva_url} target="_blank" rel="noreferrer" variant="yellow" size="sm">
            Open the design in Canva
          </Button>
        </div>
      )}

      <div id="piece-copy" style={{ marginBottom: 28 }}>
        {blocks.length === 0
          ? <Text tone="grey">No copy for this piece yet.</Text>
          : blocks.map((b, i) => <CopyBlock key={b.key ?? `${b.label}-${i}`} blockKey={b.key}
              label={b.label} body={b.body} slug={slug} contentId={item.content_id}
              canRequest={session.canSubmitRequests} idempotencyKey={randomUUID()} />)}
      </div>

      {requests.length > 0 && <section style={{ marginBottom: 28 }}>
        <Heading level={3}>Requests for this piece</Heading>
        <RequestHistory slug={slug} requests={requests} content={[item]} />
      </section>}

      <FactCheckEvidence item={item} />

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

      {item.state === 'needs_review' && session.canDecide
        ? <DecideForm slug={slug} contentId={item.content_id} />
        : item.state !== 'needs_review'
          /* audit B4: always the client wording map, never a raw state token */
          ? <Text tone="grey">This piece is {clientStateLabel(item.state)}.</Text>
          : <Text tone="grey">This piece is waiting for the primary decision-maker.</Text>}

      <CommentThread slug={slug} contentId={item.content_id} comments={comments}
        canComment={session.canComment} />

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
