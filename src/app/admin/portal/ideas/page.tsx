import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill from '../StatusPill'
import { loadIdeas } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

export default async function PortalAdminIdeasPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const ideas = await loadIdeas()
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Ideas"
        intro="The shared idea board, exactly what Maria sees. Candidate topics before they become planned pieces."
        count={ideas.length} countLabel="ideas" />
      <section className={styles.card}>
        {ideas.length === 0
          ? <p className={styles.empty}>No ideas on the board yet.</p>
          : ideas.map((idea) => (
            <article key={idea.id} className={styles.subCard}>
              <div className={styles.pubPieceHead}>
                <span className={styles.subCardTitle}>{idea.title}</span>
                <StatusPill tone="muted" label={idea.status} />
              </div>
              {idea.body && <p className={styles.metaLine}>{idea.body}</p>}
              <div className={styles.metaLine}>{idea.author_name} · {idea.created_at.slice(0, 10)}</div>
            </article>
          ))}
      </section>
    </>
  )
}
