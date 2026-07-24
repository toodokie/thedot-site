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
  return '—'
}

function ReportCard({ r }: { r: ReportRow }) {
  const metrics = Object.entries(r.metrics ?? {}).filter(([, v]) => metricValue(v) !== '—').slice(0, 12)
  return (
    <article className={styles.subCard}>
      <div className={styles.pubPieceHead}>
        <span className={styles.subCardTitle}>{r.period} · {r.platform}</span>
        <StatusPill tone="muted" label={`${r.period_start} to ${r.period_end}`} />
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
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Reports"
        intro="The twice-monthly performance review Maria sees, one snapshot per platform per half-month period."
        count={rows.length} countLabel="snapshots" />
      <section className={styles.card}>
        {rows.length === 0
          ? <p className={styles.empty}>No report snapshots yet.</p>
          : rows.map((r) => <ReportCard key={r.id} r={r} />)}
      </section>
    </>
  )
}
