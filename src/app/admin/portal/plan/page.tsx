import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill, { type PillTone } from '../StatusPill'
import { loadPlan } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

// The content plan: every piece and its planned date, the direction Maria approves. Same data as
// her Plan tab. Status -> tone (display only).
function planTone(status: string): PillTone {
  if (status === 'posted' || status === 'live') return 'live'
  if (status === 'scheduled' || status === 'approved') return 'done'
  return 'muted'
}

export default async function PortalAdminPlanPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const rows = await loadPlan()
  const scheduled = rows.filter((r) => r.planned_date)
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Plan"
        intro="The content plan, piece by piece with its planned date. This is where the calendar direction lives, the same view Maria approves from."
        count={rows.length} countLabel="pieces" />
      <section className={styles.card}>
        {rows.length === 0
          ? <p className={styles.empty}>No planned pieces yet.</p>
          : <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Planned</th><th className={styles.pieceCol}>Piece</th><th>Format</th><th>Platforms</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className={styles.cellNum}>{r.planned_date ?? <span className={styles.cellMuted}>unscheduled</span>}</td>
                    <td className={styles.pieceCol}>{r.title}</td>
                    <td className={styles.cellMuted}>{r.format ?? ''}</td>
                    <td className={styles.cellMuted}>{r.platforms.join(', ')}</td>
                    <td><StatusPill tone={planTone(r.status)} label={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
      </section>
      <p className={styles.metaLine}>{scheduled.length} of {rows.length} pieces have a planned date.</p>
    </>
  )
}
