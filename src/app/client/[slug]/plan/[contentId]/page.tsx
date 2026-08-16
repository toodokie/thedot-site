import { redirect, notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { getClientSession } from '@/lib/portal/auth'
import { getContentItem } from '@/lib/portal/data'
import { getContentAvailability, getIdeaDecision, getPlanCycleItemByContentId, getPlanCycles } from '@/lib/portal/plan-cycle'
import { routesToPiecePage } from '@/lib/portal/schedule'
import { Eyebrow, Heading, Text, Button } from '@thedot/design-system'
import CopyBlock from '@/app/client/[slug]/piece/[contentId]/CopyBlock'
import FactCheckEvidence from '../../FactCheckEvidence'
import IdeaDecisionForm from '../IdeaDecisionForm'

// Quiet metadata chips, matching the piece page.
const chip: CSSProperties = {
  fontFamily: 'var(--dot-font-text)', fontSize: 11, color: 'var(--dot-graphite)',
  border: '1px solid var(--dot-hairline)', background: 'transparent', padding: '2px 8px',
  textTransform: 'capitalize', letterSpacing: '0.01em', lineHeight: 1.5,
}
const chipDate: CSSProperties = { ...chip, fontVariantNumeric: 'tabular-nums', textTransform: 'none' }
const chipFact: CSSProperties = {
  ...chip, color: 'var(--dot-black)', background: 'var(--dot-yellow-pale)', borderColor: 'transparent',
}

// Only ideas and drafts belong on the plan surface; anything produced lives on the piece page.
const PLANNED = new Set(['idea', 'draft'])

export default async function PlanPiece({ params }: { params: Promise<{ slug: string; contentId: string }> }) {
  const { slug, contentId } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const item = await getContentItem(session.clientId, contentId)
  if (!item) {
    const planned = await getPlanCycleItemByContentId(session.clientId, contentId)
    if (!planned) notFound()
    const availability = await getContentAvailability(session.clientId, contentId)
    const cycle = (await getPlanCycles(session.clientId)).find((candidate) => candidate.id === planned.plan_cycle_id)
    const ideaDecision = cycle
      ? await getIdeaDecision(session.clientId, planned.content_item_id, cycle.id, cycle.revision)
      : null
    return (
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 0 88px' }}>
        <Button as="a" href={`/client/${slug}/plan`} variant="ghost" size="sm">Back to plan</Button>
        <div style={{ marginTop: 24, marginBottom: 8 }}>
          <Eyebrow tone="grey">Idea in the pipeline</Eyebrow>
        </div>
        <div style={{ marginBottom: 14 }}><Heading level={3}>{planned.title}</Heading></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
          {planned.format && <span style={chip}>{planned.format}</span>}
          {planned.pillar && <span style={chip}>{planned.pillar}</span>}
          {planned.platforms.map((p) => <span key={p} style={chip}>{p}</span>)}
          {planned.planned_date && <span style={chipDate}>{planned.planned_date.slice(0, 10)}</span>}
        </div>
        {planned.direction_note && (
          <div style={{ marginBottom: 24 }}><Text>{planned.direction_note}</Text></div>
        )}
        {availability === 'no_copy' && (
          <Text tone="grey">This idea is included in the plan, but copy has not been drafted yet.</Text>
        )}
        {availability === 'pending_fact_check' && (
          <Text tone="grey">Copy is being prepared. We will show it here after fact-checking is complete.</Text>
        )}
        {availability === 'pending_release' && (
          <Text tone="grey">Copy is prepared and is awaiting final release checks before it can be shared.</Text>
        )}
        {(availability === 'not_available' || availability === 'released') && (
          <Text tone="grey">This piece is not available for client viewing yet.</Text>
        )}
        {ideaDecision?.decision === 'approved' && (
          <Text tone="graphite">You approved this idea{ideaDecision.note ? `: ${ideaDecision.note}` : '.'}</Text>
        )}
        {ideaDecision?.decision === 'change_requested' && (
          <Text tone="graphite">You requested changes{ideaDecision.note ? `: ${ideaDecision.note}` : '.'}</Text>
        )}
        {!ideaDecision && cycle && session.canDecide
          && (cycle.status === 'submitted' || cycle.status === 'change_requested') && (
          <IdeaDecisionForm slug={slug} contentItemId={planned.content_item_id}
            contentId={planned.content_id} planCycleId={cycle.id} revision={cycle.revision} />
        )}
      </div>
    )
  }
  // Resolve the door by STATE first (Codex review 2026-07-21): a stale Plan URL for a piece
  // that has moved on (approved, scheduled, posted) must REDIRECT to the decidable piece
  // page, not 404. Checking status before this sent every produced piece to notFound().
  if (routesToPiecePage(item.state)) {
    redirect(`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(item.content_id)}`)
  }
  // Here the state is a quiet with_dot; the plan surface is truthful only for a genuinely
  // planned (idea/draft) piece. Any other status paired with with_dot is not a plan page.
  if (!PLANNED.has(item.status)) notFound()

  const blocks = item.copy_blocks && item.copy_blocks.length > 0
    ? item.copy_blocks
    : (item.client_body ? [{ key: null, label: 'Draft', body: item.client_body }] : [])

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '8px 0 88px' }}>
      <Button as="a" href={`/client/${slug}/plan`} variant="ghost" size="sm">Back to plan</Button>

      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <Eyebrow tone="grey">{item.status === 'idea' ? 'Idea in the pipeline' : 'Draft in progress'}</Eyebrow>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Heading level={3}>{item.title}</Heading>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
        {item.format && <span style={chip}>{item.format}</span>}
        {item.pillar && <span style={chip}>{item.pillar}</span>}
        {(item.platforms || []).map((p) => <span key={p} style={chip}>{p}</span>)}
        {item.planned_date && <span style={chipDate}>{item.planned_date.slice(0, 10)}</span>}
        {/* same fact-check wording ruling as the Overview chip (Anastasia, 2026-07-20) */}
        {item.fact_check && <span style={chipFact}>
          {item.fact_check === 'confirmed' ? 'fact-checked' : item.fact_check}
        </span>}
      </div>

      <div style={{ marginBottom: 28 }}>
        {blocks.length === 0
          ? <Text tone="grey">No draft copy for this piece yet.</Text>
          : blocks.map((b, i) => <CopyBlock key={b.key ?? `${b.label}-${i}`} blockKey={b.key ?? null} label={b.label} body={b.body} />)}
      </div>

      <FactCheckEvidence item={item} />

      <Text tone="grey">This piece is still in planning. We will send it to you for approval once it is ready.</Text>
    </div>
  )
}
