import Link from 'next/link'
import { getClientSession } from '@/lib/portal/auth'
import { redirect } from 'next/navigation'
import { getContent, getActivity, type ContentRow as ContentRowType } from '@/lib/portal/data'
import { getRecentPublishedContentIds } from '@/lib/portal/publication'
import { getCurrentPlanCycle, getUpcomingPlanCycles } from '@/lib/portal/plan-cycle'
import { getSchedule, routesToPiecePage, statusAccent } from '@/lib/portal/schedule'
import { clientStateLabel } from '@/lib/portal/state'
import { getLastSeen } from '@/lib/portal/seen'
import { getContentRequests } from '@/lib/portal/requests'
import { getClientProposals } from '@/lib/portal/proposals'
import { reReviewContext } from '@/lib/portal/re-review'
import WeekCalendar, { type WeekCalendarChip } from '@/components/portal/WeekCalendar'
import MarkSeen from './MarkSeen'
import { Eyebrow, Heading, Text, Button, Dot } from '@thedot/design-system'
import styles from './overview.module.css'

// One consistent section box for every group. `note` renders a small clarifying line
// under the label (used to explain whose action a bucket is waiting on).
function Panel({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}><Eyebrow tone="grey">{label}</Eyebrow></div>
      {note && <p className={styles.panelNote}>{note}</p>}
      {children}
    </section>
  )
}

// A clickable content row; `priority` shows a yellow dot marker (needs the client's eyes);
// `note` renders a small grey qualifier after the title (e.g. partial verification).
function ContentRow({ it, slug, priority, note }: { it: ContentRowType; slug: string; priority?: boolean; note?: string }) {
  const platforms = it.platforms || []
  return (
    <Link className={styles.row} href={`/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(it.content_id)}`}>
      {priority && <span className={styles.marker}><Dot fill="yellow" size={8} /></span>}
      <span className={styles.rowMain}>
        <Text as="span" size="md" tone="black">{it.title}</Text>
        {note && <>{' '}<Text as="span" size="sm" tone="grey">({note})</Text></>}
        {(platforms.length > 0 || it.fact_check) && (
          <span className={styles.chipRow}>
            {platforms.map((p) => <span key={p} className={styles.chip}>{p}</span>)}
            {/* 'confirmed' is OUR fact-check gate, not the client's approval; say so on the chip
                (Anastasia, 2026-07-20: a bare 'Confirmed' read as "approved by whom, of what?") */}
            {it.fact_check && (
              <span className={`${styles.chip} ${styles.chipFact}`}>
                {it.fact_check === 'confirmed' ? 'fact-checked' : it.fact_check}
              </span>
            )}
          </span>
        )}
      </span>
    </Link>
  )
}

// Activity timestamps are stored in UTC. Render them in the agency/client business
// timezone so an evening confirmation in Toronto does not appear on the next UTC day.
function formatActivityDate(value: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function torontoTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default async function Overview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  const [items, activity, lastSeen, recentPublishedIds, currentPlan, upcomingPlans, schedule, requests, proposals] = await Promise.all([
    getContent(session.clientId), getActivity(session.clientId), getLastSeen(session.clientId),
    getRecentPublishedContentIds(session.clientId), getCurrentPlanCycle(session.clientId),
    getUpcomingPlanCycles(session.clientId),
    getSchedule(session.clientId),
    getContentRequests(session.clientId),
    getClientProposals(session.clientId),
  ])
  // "new since your last visit": an event the OTHER party logged after you were last here.
  const isNew = (a: { created_at: string; actor_name: string }) =>
    Boolean(lastSeen) && a.created_at > (lastSeen as string) && a.actor_name !== session.name
  // A fact-checked released copy can be available during the plan-direction phase,
  // before a design exists. It is deliberately NOT a final package approval ask.
  const needs = items.filter((i) => i.state === 'needs_review' && Boolean(i.canva_url || i.drive_url))
  const copyReady = items.filter((i) => i.state === 'needs_review' && !i.canva_url && !i.drive_url)
  const reReviewByContentId = new Map(items.flatMap((item) => {
    const context = reReviewContext(item.version, item.state, requests.filter((request) => request.content_id === item.id))
    return context ? [[item.id, context] as const] : []
  }))
  const withDot = items.filter((i) => i.state === 'with_dot')
  const approved = items.filter((i) => i.state === 'approved')
  const scheduled = items.filter((i) => i.state === 'scheduled')
  // Audit C1: the Published bucket includes partially_live, or the whole imported posted
  // history (which can never reach 'live' under 0009's manual+verified rule) would be
  // invisible on the landing page. The per-target verification labels on each piece page
  // carry the honest nuance; the row note flags the partial case. Display only.
  const publishedItems = items.filter((i) => i.state === 'live' || i.state === 'partially_live')
  const publishedById = new Map(publishedItems.map((item) => [item.content_id, item]))
  const recentPublished = recentPublishedIds.flatMap((contentId) => {
    const item = publishedById.get(contentId)
    return item ? [item] : []
  })
  // Legacy rows may have no published_at on the client projection. Fill the small window
  // deterministically by planned date, never fall back to dumping the whole history.
  const published = [...recentPublished,
    ...publishedItems
      .filter((item) => !recentPublishedIds.includes(item.content_id))
      .sort((a, b) => (b.planned_date ?? '').localeCompare(a.planned_date ?? '')),
  ].slice(0, 5)
  // Catch-all so no piece can vanish from the landing page (Codex review 2026-07-21): the
  // schedule/publish transitional + failure states (partially_scheduled, reschedule_pending,
  // cancel_pending, schedule_failed, publish_failed) had no bucket and were only reachable
  // via Calendar. Anything not already bucketed and not archived surfaces here, labeled in
  // plain words (the failure labels reassure: "The Dot is on it").
  const BUCKETED_STATES = new Set(['needs_review', 'with_dot', 'approved', 'scheduled', 'live', 'partially_live', 'archived'])
  const inProgress = items.filter((i) => !BUCKETED_STATES.has(i.state))
  const communication = activity.filter((a) => a.event_type === 'meeting_email_note_added')
  const firstName = session.name ? session.name.split(' ')[0] : ''
  const planWaiting = currentPlan.cycle?.status === 'submitted' || currentPlan.cycle?.status === 'change_requested'
  const awaitingProposals = proposals.filter((proposal) => proposal.status === 'awaiting_decision')
  const approvalCount = needs.length + (planWaiting ? 1 : 0) + awaitingProposals.length
  const calendarDays: Record<string, WeekCalendarChip[]> = {}
  for (const row of schedule) {
    if (!row.planned_date) continue
    const href = routesToPiecePage(row.client_state)
      ? `/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(row.content_id)}`
      : `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(row.content_id)}`
    const chip: WeekCalendarChip = {
      id: row.id,
      href,
      title: row.title,
      meta: [row.format, row.pillar].filter(Boolean).join(' · ') || null,
      platforms: row.platforms,
      stateNote: row.status === 'approved' ? row.schedule_state.replaceAll('_', ' ') : null,
      syncLabel: row.calendar_sync_label ?? null,
      accent: statusAccent(row.status),
    }
    ;(calendarDays[row.planned_date.slice(0, 10)] ??= []).push(chip)
  }

  return (
    <div className={styles.wrap}>
        <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset workspace</Eyebrow></div>
        <div className={styles.greeting}>
          <Heading level={1} variant="display">Good day{firstName ? `, ${firstName}` : ''}.</Heading>
        </div>
        <div className={styles.status}>
          <Text size="lg" tone="graphite">
            {approvalCount === 0
              ? "You're all caught up."
              : <><span className={styles.statusCount}>{approvalCount}</span> waiting for you.</>}
          </Text>
        </div>

        <div className={styles.grid}>
          <div>
            <Panel
              label="Waiting on approval"
              note={planWaiting
                ? needs.length > 0
                  ? 'Your content plan and released pieces are ready for your approval.'
                  : 'Your content plan is ready for your approval.'
                : 'Fact-checked (Confirmed) is our gate; Approve is yours.'}
            >
              {planWaiting && currentPlan.cycle && (
                <Link className={styles.row} href={`/client/${encodeURIComponent(slug)}/plan`}>
                  <span className={styles.marker}><Dot fill="yellow" size={8} /></span>
                  <span className={styles.rowMain}>
                    <Text as="span" size="md" tone="black">{currentPlan.cycle.title}</Text>
                    <span className={styles.chipRow}><span className={styles.chip}>content plan</span></span>
                  </span>
                </Link>
              )}
              {awaitingProposals.map((proposal) => <Link key={proposal.id} className={styles.row}
                href={`/client/${encodeURIComponent(slug)}/requests/proposals/${encodeURIComponent(proposal.proposal_key)}`}>
                <span className={styles.marker}><Dot fill="yellow" size={8} /></span><span className={styles.rowMain}>
                  <Text as="span" size="md" tone="black">{proposal.title}</Text>
                  <span className={styles.chipRow}><span className={styles.chip}>proposal</span><span className={styles.chip}>your decision</span></span>
                </span>
              </Link>)}
              {needs.length === 0 && !planWaiting && awaitingProposals.length === 0 ? (
                <div className={styles.emptyRow}><Text size="md" tone="graphite">Nothing is waiting on your approval right now.</Text></div>
              ) : (
                needs.map((it) => {
                  const reReview = reReviewByContentId.get(it.id)
                  return <ContentRow key={it.id} it={it} slug={slug} priority
                    note={reReview ? `updated after your feedback · v${it.version}` : undefined} />
                })
              )}
            </Panel>

            {upcomingPlans.length > 0 && (
              <Panel label="Coming up" note="These are the next weeks on our radar. We will ask for your approval once each full plan is ready.">
                {upcomingPlans.map(({ cycle }) => (
                  <Link key={cycle.id} className={styles.row} href={`/client/${encodeURIComponent(slug)}/plan`}>
                    <span className={styles.rowMain}>
                      <Text as="span" size="md" tone="black">{cycle.title}</Text>
                      <span className={styles.chipRow}>
                        <span className={styles.chip}>week of {cycle.week_start}</span>
                        <span className={styles.chip}>in preparation</span>
                      </span>
                    </span>
                  </Link>
                ))}
              </Panel>
            )}

            {copyReady.length > 0 && (
              <Panel label="Copy ready for plan review" note="These fact-checked drafts are ready for your comments. Final approval opens when the linked design is ready.">
                {copyReady.map((it) => <ContentRow key={it.id} it={it} slug={slug} priority />)}
              </Panel>
            )}

            {withDot.length > 0 && (
              <Panel label="Back with The Dot">
                {withDot.map((it) => (
                  <div key={it.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Text as="span" size="md" tone="graphite">{it.title}</Text>{' '}
                      <Text as="span" size="sm" tone="grey">(we are revising this)</Text>
                    </span>
                  </div>
                ))}
              </Panel>
            )}

            {approved.length > 0 && <Panel label="Approved">{approved.map((it) => <ContentRow key={it.id} it={it} slug={slug} />)}</Panel>}
            {scheduled.length > 0 && <Panel label="Scheduled">{scheduled.map((it) => <ContentRow key={it.id} it={it} slug={slug} />)}</Panel>}
            {inProgress.length > 0 && <Panel label="In progress">{inProgress.map((it) => (
              <ContentRow key={it.id} it={it} slug={slug} note={clientStateLabel(it.state)} />
            ))}</Panel>}
            {published.length > 0 && <Panel label="Published">{published.map((it) => (
              <ContentRow key={it.id} it={it} slug={slug}
                note={it.state === 'partially_live' ? 'some platforms not yet verified' : undefined} />
            ))}</Panel>}
          </div>

          <aside>
            <Panel label="This week">
              <WeekCalendar days={calendarDays} todayIso={torontoTodayIso()} label="Content calendar" />
            </Panel>
            <Panel label="Activity">
              {activity.length === 0 ? (
                <div className={styles.emptyRow}><Text size="md" tone="graphite">No activity yet.</Text></div>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <div className={styles.actMeta}>
                        {isNew(a) && <span className={styles.newBadge}>New</span>}
                        <span className={styles.actActor}>{a.actor_name}</span>
                      </div>
                      <Text as="div" size="sm" tone="black">{a.title}</Text>
                      {a.summary && <Text as="div" size="sm" tone="graphite">{a.summary}</Text>}
                      <time className={styles.activityDate} dateTime={a.created_at}>{formatActivityDate(a.created_at)}</time>
                    </span>
                  </div>
                ))
              )}
            </Panel>

            <Panel label="Communication">
              {communication.length === 0 ? (
                <div className={styles.emptyRow}><Text size="md" tone="graphite">No emails or call recaps logged yet.</Text></div>
              ) : (
                communication.map((a) => (
                  <div key={a.id} className={styles.row}>
                    <span className={styles.rowMain}>
                      <Text as="div" size="sm" tone="black">{isNew(a) && <span className={styles.newBadge}>New</span>}{a.title}</Text>
                      {a.summary && <Text as="div" size="sm" tone="graphite">{a.summary}</Text>}
                      <time className={styles.activityDate} dateTime={a.created_at}>{formatActivityDate(a.created_at)}</time>
                    </span>
                  </div>
                ))
              )}
            </Panel>
          </aside>
        </div>

        <form className={styles.signout} action="/client/logout" method="post">
          <Button as="button" type="submit" variant="ghost" size="sm">Sign out</Button>
        </form>
        <MarkSeen slug={slug} />
      </div>
  )
}
