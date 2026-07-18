import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getSchedule, statusAccent, type ScheduleRow } from '@/lib/portal/schedule'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
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

export default async function Plan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const rows = await getSchedule(session.clientId)

  // The plan surface is the not-yet-produced pipeline: ideas and drafts only.
  const planned = rows.filter((r) => r.status === 'idea' || r.status === 'draft')
  const dated = planned.filter((r) => r.scheduled_date)
  const undated = planned.filter((r) => !r.scheduled_date)

  // Group the dated pieces by week (Monday-start), preserving getSchedule's date order.
  const weeks: { start: string; rows: ScheduleRow[] }[] = []
  for (const r of dated) {
    const ws = weekStartIso(r.scheduled_date!)
    let g = weeks.find((w) => w.start === ws)
    if (!g) { g = { start: ws, rows: [] }; weeks.push(g) }
    g.rows.push(r)
  }

  const planHref = (r: ScheduleRow) =>
    `/client/${encodeURIComponent(slug)}/plan/${encodeURIComponent(r.content_id)}`

  const renderRow = (r: ScheduleRow) => (
    <Link key={r.id} href={planHref(r)} className={styles.row}>
      <span className={`${styles.date} ${styles[`accent_${statusAccent(r.status)}`]}`}>
        {r.scheduled_date ? (
          <>
            <span className={styles.wd}>{weekdayShort(r.scheduled_date)}</span>
            <span className={styles.day}>{fmtDay(r.scheduled_date)}</span>
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
      <div className={styles.head}>
        <Heading level={2}>What we are planning next</Heading>
      </div>
      <div className={styles.sub}>
        <Text size="lg" tone="graphite">Ideas and drafts in the pipeline, before they come to you for approval.</Text>
      </div>

      {planned.length === 0 ? (
        <div className={styles.emptyRow}><Text size="md" tone="graphite">No pieces planned yet.</Text></div>
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
