import { Fragment } from 'react'
import { deriveContentStage } from '@/lib/portal/gates'
import type { AgencyPieceCalendarRow } from '@/lib/portal/gates-loader'
import StatusPill from './StatusPill'
import { stageDisplay } from './GatesAdmin'
import styles from './portal-admin.module.css'

// The branded content-calendar table (spec 2026-07-23 section 8): one row per piece,
// newest planned date first, grouped into ISO weeks, Notes shown full-width and
// untruncated on a sub-line, the whole title an accessible link into the piece page.
// Reads the broad agency calendar loader so unreleased pipeline pieces show too.

const PLATFORM_SHORT: Record<string, string> = {
  instagram: 'IG', facebook: 'FB', youtube: 'YT', linkedin: 'LinkedIn', squarespace: 'Web',
}
const PRODUCER_LABEL: Record<string, string> = { the_dot: 'The Dot', studio: 'Studio' }

// UTC-based so the week never shifts under the viewer's timezone.
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDay() // 0 Sun .. 6 Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day))
  return d.toISOString().slice(0, 10)
}
function fmt(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export default function PieceCalendarTable({ rows }: { rows: AgencyPieceCalendarRow[] }) {
  const active = rows.filter((r) => !r.archived)
  // newest planned date first; unscheduled pieces fall to the bottom.
  const sorted = [...active].sort((a, b) => {
    if (a.plannedDate && b.plannedDate) return b.plannedDate.localeCompare(a.plannedDate)
    if (a.plannedDate) return -1
    if (b.plannedDate) return 1
    return 0
  })
  // group consecutive rows into their ISO week (Monday); nulls into one trailing bucket.
  const groups: Array<{ key: string; label: string; items: AgencyPieceCalendarRow[] }> = []
  for (const r of sorted) {
    const key = r.plannedDate ? mondayOf(r.plannedDate) : 'unscheduled'
    const label = r.plannedDate ? `Week of ${fmt(key)}` : 'No date yet'
    const last = groups[groups.length - 1]
    if (!last || last.key !== key) groups.push({ key, label, items: [r] })
    else last.items.push(r)
  }

  if (active.length === 0) {
    return <section className={styles.card}><p className={styles.empty}>No pieces yet.</p></section>
  }

  return (
    <section className={styles.card}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.calDateCol}>Date</th><th className={styles.pieceCol}>Piece</th>
              <th>Pillar</th><th>Format</th><th>Platforms</th><th>Producer</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className={styles.weekRow}><td colSpan={7}>{g.label}</td></tr>
                {g.items.map((r) => {
                  const s = deriveContentStage(r)
                  const sd = stageDisplay(s.stage, s.label)
                  const hasNote = Boolean(r.calendarNote)
                  return (
                    <Fragment key={`${r.clientId}:${r.contentId}`}>
                      <tr className={hasNote ? styles.calRow : `${styles.calRow} ${styles.calRowEnd}`}>
                        <td className={styles.calDate}>{r.plannedDate ? fmt(r.plannedDate) : '—'}</td>
                        <td className={styles.pieceCol}>
                          <a className={styles.pieceLink} href={`/admin/portal/pieces/${encodeURIComponent(r.contentId)}`}>{r.title}</a>
                          {r.notShared && <span className={styles.notShared}>not shared</span>}
                        </td>
                        <td className={styles.cellMuted}>{r.pillar ?? ''}</td>
                        <td className={styles.cellMuted}>{r.format ?? ''}</td>
                        <td className={styles.cellMuted}>{r.platforms.map((p) => PLATFORM_SHORT[p] ?? p).join(' · ')}</td>
                        <td className={styles.cellMuted}>{r.producer ? PRODUCER_LABEL[r.producer] ?? r.producer : ''}</td>
                        <td><span className={styles.stageCell}><StatusPill tone={sd.tone} label={sd.label} />
                          {sd.detail && <span className={styles.stageDetail}>{sd.detail}</span>}</span></td>
                      </tr>
                      {hasNote && (
                        <tr className={styles.calNoteRow}>
                          <td />
                          <td colSpan={6} className={styles.calNote}>{r.calendarNote}</td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
