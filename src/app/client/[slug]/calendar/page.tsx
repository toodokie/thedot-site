import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getSchedule, statusAccent, isProduced, type ScheduleRow } from '@/lib/portal/schedule'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import MonthGrid, { type CalendarChip } from './MonthGrid'
import styles from './calendar.module.css'

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

// Request-time "today" in the business timezone (Toronto), not the server's UTC clock:
// a late-evening Toronto visit must not open next month's grid. en-CA formats YYYY-MM-DD.
function torontoTodayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

export default async function Calendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const rows = await getSchedule(session.clientId)

  const todayIso = torontoTodayIso()

  const hrefFor = (r: ScheduleRow) =>
    isProduced(r.status)
      ? `/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(r.content_id)}`
      : `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(r.content_id)}`

  // Group scheduled pieces by day as ready-to-render chip data for the client grid;
  // collect the unscheduled ones separately.
  const days: Record<string, CalendarChip[]> = {}
  const unscheduled: ScheduleRow[] = []
  for (const r of rows) {
    if (!r.planned_date) { unscheduled.push(r); continue }
    const key = r.planned_date.slice(0, 10)
    const chip: CalendarChip = {
      id: r.id,
      href: hrefFor(r),
      title: r.title,
      meta: [r.format, r.pillar].filter(Boolean).join(' · ') || null,
      platforms: r.platforms,
      stateNote: r.status === 'approved' ? r.schedule_state.replaceAll('_', ' ') : null,
      syncLabel: r.calendar_sync_label ?? null,
      accent: statusAccent(r.status),
    }
    ;(days[key] ??= []).push(chip)
  }

  // Upcoming list, grouped by week (today onward, any month).
  const upcoming = rows.filter((r) => r.planned_date && r.planned_date.slice(0, 10) >= todayIso)
  const weeks: { start: string; rows: ScheduleRow[] }[] = []
  for (const r of upcoming) {
    const ws = weekStartIso(r.planned_date!)
    let g = weeks.find((w) => w.start === ws)
    if (!g) { g = { start: ws, rows: [] }; weeks.push(g) }
    g.rows.push(r)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Content calendar</Eyebrow></div>
      <div className={styles.head}>
        <Heading level={2}>Content calendar</Heading>
      </div>
      <div className={styles.sub}>
        <Text size="lg" tone="graphite">Everything planned, produced, and posted.</Text>
      </div>
      <p className={styles.calendarNote}>This portal is the workflow record. The shared Google Calendar is an agency coordination surface, not proof of scheduling or publication.</p>

      {/* colour legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.accent_yellow}`} />In planning</span>
        <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.accent_graphite}`} />Approved or scheduled</span>
        <span className={styles.legendItem}><span className={`${styles.swatch} ${styles.accent_grey}`} />Published</span>
      </div>

      {/* the month grid: current month by default, prev/next navigation */}
      <MonthGrid days={days} todayIso={todayIso} />

      {/* upcoming list, grouped by week */}
      <div className={styles.listHead}><Eyebrow tone="grey">Upcoming, by week</Eyebrow></div>
      {weeks.length === 0 ? (
        <div className={styles.emptyRow}><Text size="md" tone="graphite">No pieces scheduled yet.</Text></div>
      ) : (
        weeks.map((w) => (
          <section key={w.start} className={styles.weekBlock}>
            <div className={styles.weekLabel}><Text as="span" size="sm" tone="grey">Week of {fmtDay(w.start)}</Text></div>
            {w.rows.map((r) => (
              <Link key={r.id} href={hrefFor(r)} className={styles.listRow}>
                <span className={`${styles.listDate} ${styles[`accent_${statusAccent(r.status)}`]}`}>
                  <span className={styles.listWd}>{weekdayShort(r.planned_date!)}</span>
                  <span className={styles.listDay}>{fmtDay(r.planned_date!)}</span>
                </span>
                <span className={styles.listMain}>
                  <Text as="span" size="md" tone="black">{r.title}</Text>
                  <span className={styles.listChips}>
                    {(r.format || r.pillar) && <span className={styles.metaChip}>{[r.format, r.pillar].filter(Boolean).join(' · ')}</span>}
                    {r.platforms.map((p) => <span key={p} className={styles.metaChip}>{p}</span>)}
                    {r.status === 'approved' && (
                      <span className={styles.metaChip}>{r.schedule_state.replaceAll('_', ' ')}</span>
                    )}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        ))
      )}

      {/* unscheduled bucket */}
      {unscheduled.length > 0 && (
        <>
          <div className={styles.listHead}><Eyebrow tone="grey">Unscheduled</Eyebrow></div>
          <section className={styles.weekBlock}>
            {unscheduled.map((r) => (
              <Link key={r.id} href={hrefFor(r)} className={styles.listRow}>
                <span className={`${styles.listDate} ${styles[`accent_${statusAccent(r.status)}`]}`}>
                  <span className={styles.listWd}>No</span>
                  <span className={styles.listDay}>date</span>
                </span>
                <span className={styles.listMain}>
                  <Text as="span" size="md" tone="black">{r.title}</Text>
                  <span className={styles.listChips}>
                    {(r.format || r.pillar) && <span className={styles.metaChip}>{[r.format, r.pillar].filter(Boolean).join(' · ')}</span>}
                    {r.platforms.map((p) => <span key={p} className={styles.metaChip}>{p}</span>)}
                  </span>
                </span>
              </Link>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
