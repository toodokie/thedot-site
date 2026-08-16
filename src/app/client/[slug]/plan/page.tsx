import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getSchedule, statusAccent, belongsOnPlanSurface, type ScheduleRow } from '@/lib/portal/schedule'
import { getOpenPlanCycles, getPlanCycleDecisions, getUpcomingPlanCycles, type PlanCycleItem } from '@/lib/portal/plan-cycle'
import { getContent, type ContentRow } from '@/lib/portal/data'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import PlanDecideForm from './PlanDecideForm'
import styles from './plan.module.css'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => String(n).padStart(2, '0')
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${MONTHS_SHORT[m - 1]} ${d}`
}
function weekdayShort(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return WD_SHORT[new Date(y, m - 1, d).getDay()]
}
// Monday that starts the week containing this date, as a YYYY-MM-DD string.
function weekStartIso(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const dow = (dt.getDay() + 6) % 7 // 0 = Monday
  dt.setDate(dt.getDate() - dow)
  return isoOf(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

function fmtRange(startIso: string, endIso: string): string {
  return `${fmtDay(startIso)} to ${fmtDay(endIso)}`
}

function CycleItem({ item, slug, content }: { item: PlanCycleItem; slug: string; content: ContentRow | null }) {
  const meta = [item.format, ...item.platforms].filter(Boolean)
  const href = content
    ? `/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(item.content_id)}`
    : `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(item.content_id)}`
  const hasDesign = Boolean(content?.canva_url || content?.drive_url)
  return (
    <li className={styles.cycleItem}>
      <Link href={href} className={styles.cycleItemLink}>
        <span className={styles.cyclePos} aria-hidden="true">{item.position}</span>
        <span className={styles.cycleItemMain}>
          <Text as="span" size="md" tone="black">{item.title}</Text>
          <span className={styles.cycleItemMeta}>
            {item.planned_date && <span className={styles.chip}>{fmtDay(item.planned_date)}</span>}
            {meta.map((m) => <span key={m} className={styles.chip}>{m}</span>)}
          </span>
          {content && (
            <span className={styles.reviewAvailability}>
              {hasDesign
                ? 'Fact-checked copy and linked design are available for final review.'
                : 'Fact-checked copy is available for plan review. Design is still in progress.'}
            </span>
          )}
          {item.direction_note && <span className={styles.cycleNote}><Text as="span" size="sm" tone="graphite">{item.direction_note}</Text></span>}
        </span>
      </Link>
    </li>
  )
}

export default async function Plan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const [rows, content] = await Promise.all([
    getSchedule(session.clientId),
    getContent(session.clientId),
  ])
  const contentById = new Map(content.map((item) => [item.content_id, item]))

  // A client may be asked to approve multiple future weeks at once. This is a queue, not
  // a single "current" plan. A missing projection still throws into the route boundary.
  const [openCycles, upcomingCycles] = await Promise.all([
    getOpenPlanCycles(session.clientId),
    getUpcomingPlanCycles(session.clientId),
  ])
  const decisionsByCycle = new Map(await Promise.all(openCycles.map(async ({ cycle }) => [
    cycle.id,
    await getPlanCycleDecisions(session.clientId, cycle.id),
  ] as const)))

  // The plan surface is the quiet pipeline only (audit B1): ideas and drafts still with
  // The Dot. A released-for-review piece (client_state needs_review) is already the
  // client's approval ask and renders in the Overview's waiting bucket instead; showing
  // it here as "before they come to you" contradicted the ask.
  const planned = rows.filter((r) => belongsOnPlanSurface(r.status, r.client_state))
  const dated = planned.filter((r) => r.planned_date)
  const undated = planned.filter((r) => !r.planned_date)

  // Group the dated pieces by week (Monday-start), preserving getSchedule's date order.
  const weeks: { start: string; rows: ScheduleRow[] }[] = []
  for (const r of dated) {
    const ws = weekStartIso(r.planned_date!)
    let g = weeks.find((w) => w.start === ws)
    if (!g) { g = { start: ws, rows: [] }; weeks.push(g) }
    g.rows.push(r)
  }

  const planHref = (r: ScheduleRow) =>
    `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(r.content_id)}`
  const approvalCycles = openCycles.filter(({ cycle }) => cycle.status === 'submitted')

  const renderRow = (r: ScheduleRow) => (
    <Link key={r.id} href={planHref(r)} className={styles.row}>
      <span className={`${styles.date} ${styles[`accent_${statusAccent(r.client_state)}`]}`}>
        {r.planned_date ? (
          <>
            <span className={styles.wd}>{weekdayShort(r.planned_date)}</span>
            <span className={styles.day}>{fmtDay(r.planned_date)}</span>
          </>
        ) : (
          <>
            <span className={styles.wd}>No</span>
            <span className={styles.day}>date</span>
          </>
        )}
      </span>
      <span className={styles.main}>
        <Text as="span" size="md" tone="black">{r.title}</Text>
        <span className={styles.chipRow}>
          {(r.format || r.pillar) && <span className={styles.chip}>{[r.format, r.pillar].filter(Boolean).join(' · ')}</span>}
          {r.platforms.map((p) => <span key={p} className={styles.chip}>{p}</span>)}
          <span className={styles.chip}>{r.status}</span>
        </span>
      </span>
    </Link>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Plan</Eyebrow></div>
      <div className={styles.pageTitle}><Heading level={3} as="h1">Content plan</Heading></div>

      {approvalCycles.length > 0 && (
        <section className={styles.approvalQueue} aria-label="Plans awaiting your approval">
          <Eyebrow tone="grey">Needs your decision</Eyebrow>
          <Heading level={3} as="h2">{approvalCycles.length} {approvalCycles.length === 1 ? 'plan is' : 'plans are'} waiting for you</Heading>
          <Text size="md" tone="graphite">
            Approve each week separately. Start with the earliest week, or open any piece for more detail before deciding.
          </Text>
          <nav className={styles.approvalQueueLinks} aria-label="Plans awaiting approval">
            {approvalCycles.map(({ cycle }) => (
              <a key={cycle.id} href={`#plan-cycle-${cycle.id}`}>{cycle.title}</a>
            ))}
          </nav>
        </section>
      )}

      {openCycles.map(({ cycle, items: cycleItems }) => {
        const lastChangeNote = decisionsByCycle.get(cycle.id)?.find((d) => d.decision === 'change_requested')?.note ?? null
        return <section key={cycle.id} id={`plan-cycle-${cycle.id}`} className={styles.cycleCard} aria-label={`Plan awaiting review: ${cycle.title}`}>
          <div className={styles.cycleHead}>
            <Heading level={2}>{cycle.title}</Heading>
            <span className={`${styles.statusBadge} ${
              cycle.status === 'approved' ? styles.statusApproved
                : cycle.status === 'change_requested' ? styles.statusChanges
                  : styles.statusOpen}`}>
              {cycle.status === 'approved' ? 'Approved'
                : cycle.status === 'change_requested' ? 'Changes requested'
                  : 'Awaiting your approval'}
            </span>
          </div>
          <div className={styles.cycleMeta}>
            <Text as="span" size="sm" tone="grey">
              Week of {fmtRange(cycle.week_start, cycle.week_end)}{cycle.revision > 1 ? ` · Revision ${cycle.revision}` : ''}
            </Text>
          </div>
          <div className={styles.cycleSummary}><Text size="md" tone="graphite">{cycle.direction_summary}</Text></div>

          {session.canDecide && cycle.status === 'submitted' && (
            <div className={styles.primaryDecision}>
              <div className={styles.primaryDecisionCopy}>
                <Text as="p" size="md" tone="black">Happy with this week&rsquo;s direction?</Text>
                <Text as="p" size="sm" tone="graphite">Approve now, or review the pieces below for more detail.</Text>
              </div>
              <PlanDecideForm slug={slug} cycleId={cycle.id} revision={cycle.revision} mode="approve" />
            </div>
          )}

          {cycleItems.length > 0 && (
            <ol className={styles.cycleList}>
              {cycleItems.map((it) => <CycleItem key={it.id} item={it} slug={slug} content={contentById.get(it.content_id) ?? null} />)}
            </ol>
          )}

          {cycle.status === 'approved' ? (
            <p className={styles.decisionApproved} role="status">
              You approved this plan{cycle.decided_at ? ` on ${fmtDay(cycle.decided_at)}` : ''}. I am producing these pieces now. A separate final decision comes once copy and design are ready together.
            </p>
          ) : cycle.status === 'change_requested' ? (
            <div className={styles.decisionChanges} role="status">
              <Text as="p" size="md" tone="black">
                You requested changes{cycle.decided_at ? ` on ${fmtDay(cycle.decided_at)}` : ''}. The Dot is revising the plan and will resubmit it for your approval.
              </Text>
              {lastChangeNote && <p className={styles.decisionNote}>{lastChangeNote}</p>}
            </div>
          ) : session.canDecide ? (
            <div className={styles.decisionOpen}>
              <Text as="p" size="md" tone="black">Finished reviewing? Approve this plan, or open a change request and tell me what needs adjusting.</Text>
              <PlanDecideForm slug={slug} cycleId={cycle.id} revision={cycle.revision} />
            </div>
          ) : (
            <p className={styles.decisionMuted} role="status">This plan is awaiting approval from your account&rsquo;s decision-maker.</p>
          )}
        </section>
      })}

      {upcomingCycles.map(({ cycle: upcoming, items }) => (
        <section key={upcoming.id} className={styles.cycleCard} aria-label={`Coming up: ${upcoming.title}`}>
          <div className={styles.cycleHead}>
            <Heading level={2}>{upcoming.title}</Heading>
            <span className={`${styles.statusBadge} ${styles.statusDraft}`}>In preparation</span>
          </div>
          <div className={styles.cycleMeta}>
            <Text as="span" size="sm" tone="grey">Week of {fmtRange(upcoming.week_start, upcoming.week_end)}</Text>
          </div>
          <div className={styles.cycleSummary}>
            <Text size="md" tone="graphite">{upcoming.direction_summary}</Text>
          </div>
          {items.length > 0 && (
            <ol className={styles.cycleList}>
              {items.map((it) => <CycleItem key={it.id} item={it} slug={slug} content={contentById.get(it.content_id) ?? null} />)}
            </ol>
          )}
          <p className={styles.decisionMuted} role="status">
            This is coming up. I am still building the week, so there is nothing for you to approve yet.
          </p>
        </section>
      ))}

      <div className={styles.head}>
        <Heading level={openCycles.length ? 3 : 2}>What I am planning next</Heading>
      </div>
      <div className={styles.sub}>
        <Text size="lg" tone="graphite">Ideas and drafts in the pipeline, before they come to you for approval.</Text>
      </div>

      {planned.length === 0 ? (
        <div className={styles.emptyRow}><Text size="md" tone="graphite">Nothing in early planning right now. Pieces awaiting your approval are on the Overview.</Text></div>
      ) : (
        <>
          {weeks.map((w) => (
            <section key={w.start} className={styles.weekBlock}>
              <div className={styles.weekLabel}><Text as="span" size="sm" tone="grey">Week of {fmtDay(w.start)}</Text></div>
              {w.rows.map(renderRow)}
            </section>
          ))}

          {undated.length > 0 && (
            <section className={styles.weekBlock}>
              <div className={styles.weekLabel}><Text as="span" size="sm" tone="grey">Not dated yet</Text></div>
              {undated.map(renderRow)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
