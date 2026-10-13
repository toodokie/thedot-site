import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill from '../StatusPill'
import { loadRecommendations } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

export default async function PortalAdminStrategyPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const recs = await loadRecommendations()
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Strategy"
        intro="The recommendations Maria sees, the strategic calls behind the content."
        count={recs.length} countLabel="recommendations" />
      <section className={styles.card}>
        {recs.length === 0
          ? <p className={styles.empty}>No recommendations published yet.</p>
          : recs.map((rec) => (
            <article key={rec.id} className={styles.subCard}>
              <div className={styles.pubPieceHead}>
                <span className={styles.subCardTitle}>{rec.title}</span>
                <StatusPill tone="muted" label={rec.category} />
              </div>
              <p className={styles.metaLine}>{rec.body}</p>
              <div className={styles.metaLine}>{rec.platform ? `${rec.platform} · ` : ''}{rec.status} · {rec.created_at.slice(0, 10)}</div>
            </article>
          ))}
      </section>
    </>
  )
}
