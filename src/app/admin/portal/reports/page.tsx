import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill from '../StatusPill'
import { loadReports, type ReportRow } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

// Metrics are agent-fed + free-form; render defensively. A value is either a plain number or an
// object carrying the previous period ({ current, previous, ... }); show the current figure.
function metricValue(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'number' || typeof v === 'string') return String(v)
  if (typeof v === 'object' && 'current' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>).current ?? '—')
  }
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const value = (v as Record<string, unknown>).value
    const previous = (v as Record<string, unknown>).prev
    return previous == null ? String(value ?? '—') : `${String(value ?? '—')} (prev ${String(previous)})`
  }
  return '—'
}

const PLATFORM_ORDER = ['instagram', 'facebook', 'youtube', 'website']
function latestByPlatform(rows: ReportRow[]): ReportRow[] {
  const best = new Map<string, ReportRow>()
  for (const row of rows) {
    const current = best.get(row.platform)
    if (!current || row.period_start > current.period_start) best.set(row.platform, row)
  }
  const rank = (platform: string) => {
    const index = PLATFORM_ORDER.indexOf(platform)
    return index < 0 ? PLATFORM_ORDER.length : index
  }
  return [...best.values()].sort((a, b) => rank(a.platform) - rank(b.platform) || a.platform.localeCompare(b.platform))
}

function formatWindow(start: string, end: string): string {
  return `${start} to ${end}`
}

function ReportCard({ r }: { r: ReportRow }) {
  const metrics = Object.entries(r.metrics ?? {}).filter(([, v]) => metricValue(v) !== '—').slice(0, 12)
  return (
    <article className={styles.subCard}>
      <div className={styles.pubPieceHead}>
        <span className={styles.subCardTitle}>{r.period} · {r.platform}</span>
        <StatusPill tone="muted" label={formatWindow(r.period_start, r.period_end)} />
      </div>
      {r.summary && <p className={styles.metaLine}>{r.summary}</p>}
      {metrics.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {metrics.map(([k, v]) => (
                <tr key={k}><td className={styles.cellMuted}>{k.replaceAll('_', ' ')}</td><td className={styles.cellNum}>{metricValue(v)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  )
}

export default async function PortalAdminReportsPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const rows = (await loadReports()).filter((r) => r.schema_version >= 1)
  const latest = latestByPlatform(rows)
  const latestIds = new Set(latest.map((row) => row.id))
  const history = rows.filter((row) => !latestIds.has(row.id))
  const periods = [...new Set(history.map((row) => row.period))]
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Reports"
        intro="The twice-monthly performance review Maria sees, one snapshot per platform per half-month period."
        count={rows.length} countLabel="snapshots" />
      <section className={styles.card}>
        {rows.length === 0
          ? <p className={styles.empty}>No report snapshots yet.</p>
          : <>
            <div className={styles.reportSectionHead}><span className={styles.groupLabel}>Latest by platform</span><span className={styles.meta}>{latest.length} platforms</span></div>
            <div className={styles.reportGrid}>{latest.map((r) => <ReportCard key={r.id} r={r} />)}</div>
            {periods.length > 0 && <>
              <div className={styles.reportHistoryHead}><span className={styles.groupLabel}>Earlier snapshots</span></div>
              {periods.map((period) => (
                <div key={period} className={styles.reportPeriod}>
                  <div className={styles.reportPeriodHead}><span className={styles.subCardTitle}>{period}</span></div>
                  <div className={styles.reportGrid}>{history.filter((row) => row.period === period).map((r) => <ReportCard key={r.id} r={r} />)}</div>
                </div>
              ))}
            </>}
          </>}
      </section>
    </>
  )
}
