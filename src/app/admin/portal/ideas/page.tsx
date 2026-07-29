import { redirect } from 'next/navigation'
import Link from 'next/link'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import StatusPill from '../StatusPill'
import { loadIdeaComments, loadIdeas } from '../mirror-data'
import IdeaCommentsAdmin from '../IdeaCommentsAdmin'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

export default async function PortalAdminIdeasPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const [ideas, comments] = await Promise.all([loadIdeas(), loadIdeaComments()])
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Idea inbox"
        intro="Raw ideas before they become planned pieces. Promoted ideas link to their piece."
        count={ideas.length} countLabel="ideas" />
      <section className={styles.card}>
        {ideas.length === 0
          ? <p className={styles.empty}>No ideas on the board yet.</p>
          : ideas.map((idea) => (
            <article key={idea.id} id={`idea-${idea.id}`} className={styles.subCard}>
              <div className={styles.pubPieceHead}>
                {idea.became_content_id ? (
                  <Link className={styles.subCardTitle} href={`/admin/portal/pieces/${encodeURIComponent(idea.became_content_id)}`}>
                    {idea.title}
                  </Link>
                ) : <span className={styles.subCardTitle}>{idea.title}</span>}
                <StatusPill tone="muted" label={idea.status} />
              </div>
              {idea.body && <p className={styles.metaLine}>{idea.body}</p>}
              <div className={styles.metaLine}>{idea.author_name} · {idea.created_at.slice(0, 10)}</div>
              <IdeaCommentsAdmin ideaId={idea.id} comments={comments.filter((comment) => comment.ideaId === idea.id)} />
            </article>
          ))}
      </section>
    </>
  )
}
