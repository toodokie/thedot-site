import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill, { type PillTone } from '../StatusPill'
import { loadPlan, loadPlanCycle } from '../mirror-data'
import styles from '../portal-admin.module.css'
import PlanDateControl from './PlanDateControl'

export const dynamic = 'force-dynamic'

// The content plan: every piece and its planned date, the direction Maria approves. Same data as
// her Plan tab. Status -> tone (display only).
function planTone(status: string): PillTone {
  if (status === 'posted' || status === 'live') return 'live'
  if (status === 'scheduled' || status === 'approved') return 'done'
  return 'muted'
}
function cycleTone(status: string): PillTone {
  return status === 'approved' ? 'done' : 'muted'
}

function planReviewState(row: { released: boolean; fact_check_valid: boolean } | undefined): string {
  if (!row) return 'Identity not loaded'
  if (row.released && row.fact_check_valid) return 'Copy available for plan review'
  if (row.released) return 'Copy is not eligible for client review'
  return 'In preparation'
}

export default async function PortalAdminPlanPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const [rows, plan] = await Promise.all([loadPlan(), loadPlanCycle()])
  const rowsByContentId = new Map(rows.map((row) => [row.content_id, row]))
  const scheduled = rows.filter((r) => r.planned_date)
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Plan"
        intro="The weekly plan cycle Maria approves, plus the content plan piece by piece with its planned date."
        count={rows.length} countLabel="pieces" />

      <section className={styles.card}>
        {!plan.cycle ? (
          <p className={styles.empty}>No plan cycle submitted yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              <strong>{plan.cycle.title}</strong>
              <StatusPill tone={cycleTone(plan.cycle.status)} label={plan.cycle.status.replace('_', ' ')} />
            </div>
            <p className={styles.cellMuted} style={{ marginTop: 0 }}>
              Week {plan.cycle.week_start} to {plan.cycle.week_end} · revision {plan.cycle.revision}
              {plan.cycle.status === 'approved' && plan.cycle.approved_revision ? ` · approved rev ${plan.cycle.approved_revision}` : ''}
            </p>
            <p style={{ margin: '8px 0 16px' }}>{plan.cycle.direction_summary}</p>
            {plan.items.length > 0 && (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                  <tr><th>#</th><th>Planned</th><th className={styles.pieceCol}>Piece</th><th>Format</th><th>Platforms</th><th>Review</th><th>Direction note</th></tr>
                  </thead>
                  <tbody>
                    {plan.items.map((it) => (
                      <tr key={it.id}>
                        <td className={styles.cellNum}>{it.position}</td>
                        <td className={styles.cellNum}>
                          <PlanDateControl clientSlug="kanset" contentId={it.content_id} initialDate={it.planned_date} />
                        </td>
                        <td className={styles.pieceCol}>
                          <a className={styles.pieceLink} href={`/admin/portal/pieces/${encodeURIComponent(it.content_id)}`}>
                            {it.title}
                          </a>
                        </td>
                        <td className={styles.cellMuted}>{it.format ?? ''}</td>
                        <td className={styles.cellMuted}>{it.platforms.join(', ')}</td>
                        <td className={styles.cellMuted}>{planReviewState(rowsByContentId.get(it.content_id))}</td>
                        <td className={styles.cellMuted}>{it.direction_note ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {plan.latestDecision && (
              <p className={styles.metaLine}>
                Client {plan.latestDecision.decision.replace('_', ' ')} (revision {plan.latestDecision.revision}) on {plan.latestDecision.created_at.slice(0, 10)}
                {plan.latestDecision.note ? `: ${plan.latestDecision.note}` : ''}
              </p>
            )}
          </>
        )}
      </section>

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
                    <td className={styles.pieceCol}>
                      <a className={styles.pieceLink} href={`/admin/portal/pieces/${encodeURIComponent(r.content_id)}`}>
                        {r.title}
                      </a>
                    </td>
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
