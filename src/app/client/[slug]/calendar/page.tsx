import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getSchedule, statusAccent, isProduced, type ScheduleRow } from '@/lib/portal/schedule'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import styles from './calendar.module.css'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WD_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Monday-start week to match Kanset's business-week cadence.
const WEEK_HEAD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

// A month is addressed by a single index (year * 12 + zero-based month) so the range from the
// earliest piece to next month is a plain integer sweep.
const monthKey = (y: number, m: number) => y * 12 + m
const yearOfKey = (k: number) => Math.floor(k / 12)
const monthOfKey = (k: number) => ((k % 12) + 12) % 12

// One month's calendar cells (Monday-start): leading blanks, the days, trailing blanks.
function monthCells(year: number, month: number): (number | null)[] {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// Heading over the whole calendar: the span it covers, e.g. "June to August 2026".
function rangeLabel(startKey: number, endKey: number): string {
  const sY = yearOfKey(startKey), sM = monthOfKey(startKey)
  const eY = yearOfKey(endKey), eM = monthOfKey(endKey)
  if (startKey === endKey) return `${MONTHS[sM]} ${sY}`
  if (sY === eY) return `${MONTHS[sM]} to ${MONTHS[eM]} ${eY}`
  return `${MONTHS[sM]} ${sY} to ${MONTHS[eM]} ${eY}`
}

export default async function Calendar({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const rows = await getSchedule(session.clientId)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-based
  const todayIso = isoOf(year, month + 1, now.getDate())
  const currentKey = monthKey(year, month)

  // Group scheduled pieces by day; collect the unscheduled ones separately. Track the earliest
  // scheduled month so the grids can reach back over every month that actually holds a piece.
  const byDay = new Map<string, ScheduleRow[]>()
  const unscheduled: ScheduleRow[] = []
  let startKey = currentKey // never later than this: the current month always renders
  for (const r of rows) {
    if (!r.planned_date) { unscheduled.push(r); continue }
    const key = r.planned_date.slice(0, 10)
    const list = byDay.get(key)
    if (list) list.push(r)
    else byDay.set(key, [r])
    const [ry, rm] = key.split('-').map(Number)
    const k = monthKey(ry, rm - 1)
    if (k < startKey) startKey = k
  }

  // Range: earliest month that has a piece through next month. Newest month first (next month
  // at the top, history below), so the most actionable content leads. Only months in range render.
  const endKey = currentKey + 1
  const monthsToRender: number[] = []
  for (let k = endKey; k >= startKey; k--) monthsToRender.push(k)

  // Upcoming list, grouped by week (today onward, any month).
  const upcoming = rows.filter((r) => r.planned_date && r.planned_date.slice(0, 10) >= todayIso)
  const weeks: { start: string; rows: ScheduleRow[] }[] = []
  for (const r of upcoming) {
    const ws = weekStartIso(r.planned_date!)
    let g = weeks.find((w) => w.start === ws)
    if (!g) { g = { start: ws, rows: [] }; weeks.push(g) }
    g.rows.push(r)
  }

  const hrefFor = (r: ScheduleRow) =>
    isProduced(r.status)
      ? `/client/${encodeURIComponent(slug)}/piece/${encodeURIComponent(r.content_id)}`
      : `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(r.content_id)}`

  const renderChip = (r: ScheduleRow) => (
    <Link key={r.id} href={hrefFor(r)} className={`${styles.chip} ${styles[`accent_${statusAccent(r.status)}`]}`}>
      <span className={styles.chipTitle}>{r.title}</span>
      {(r.format || r.pillar) && (
        <span className={styles.chipMeta}>{[r.format, r.pillar].filter(Boolean).join(' · ')}</span>
      )}
      {r.platforms.length > 0 && (
        <span className={styles.chipPlatforms}>
          {r.platforms.map((p) => <span key={p} className={styles.plat}>{p}</span>)}
        </span>
      )}
      {r.status === 'approved' && (
        <span className={styles.chipMeta}>{r.schedule_state.replaceAll('_', ' ')}</span>
      )}
      {r.calendar_sync_label && <span className={styles.chipMeta}>{r.calendar_sync_label}</span>}
    </Link>
  )

  return (
    <div className={styles.wrap}>
      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Content calendar</Eyebrow></div>
      <div className={styles.head}>
        <Heading level={2}>{rangeLabel(startKey, endKey)}</Heading>
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

      {/* one month grid per month in range, newest first */}
      {monthsToRender.map((mk) => {
        const my = yearOfKey(mk)
        const mm = monthOfKey(mk)
        const cells = monthCells(my, mm)
        return (
          <section key={mk} className={styles.monthBlock}>
            <div className={styles.monthLabel}><Heading level={3}>{MONTHS[mm]} {my}</Heading></div>
            <div className={styles.gridScroll}>
              <div className={styles.gridHead}>
                {WEEK_HEAD.map((w) => <div key={w} className={styles.gridHeadCell}>{w}</div>)}
              </div>
              <div className={styles.grid}>
                {cells.map((day, i) => {
                  if (day === null) return <div key={`b-${i}`} className={`${styles.cell} ${styles.cellBlank}`} />
                  const key = isoOf(my, mm + 1, day)
                  const dayRows = byDay.get(key) ?? []
                  const isToday = key === todayIso
                  return (
                    <div key={key} className={isToday ? `${styles.cell} ${styles.today}` : styles.cell}>
                      <div className={styles.dayNum}>{day}</div>
                      {dayRows.length > 0 && <div className={styles.chips}>{dayRows.map(renderChip)}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )
      })}

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
