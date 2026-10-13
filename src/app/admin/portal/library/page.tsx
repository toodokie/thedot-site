import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import { loadLinks, type LinkRow } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

const CATEGORY_LABEL: Record<string, string> = { brand: 'Brand', video: 'Video', posting: 'Posting' }

export default async function PortalAdminLibraryPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const links = await loadLinks()
  const groups = new Map<string, LinkRow[]>()
  for (const link of links) (groups.get(link.category) ?? groups.set(link.category, []).get(link.category)!).push(link)
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Library"
        intro="The brand, video, and posting links Maria has, curated client-safe URLs (no files, per the PII rule)."
        count={links.length} countLabel="links" />
      <section className={styles.card}>
        {links.length === 0
          ? <p className={styles.empty}>No library links yet.</p>
          : [...groups.entries()].map(([category, rows]) => (
            <div key={category} className={styles.group}>
              <div className={styles.groupLabel}>{CATEGORY_LABEL[category] ?? category}</div>
              {rows.map((link) => (
                <div key={link.id} className={styles.taskRow}>
                  <span className={styles.taskMain}>
                    <a className={styles.destLink} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
                    {link.description && <span className={styles.meta}>{link.description}</span>}
                  </span>
                </div>
              ))}
            </div>
          ))}
      </section>
    </>
  )
}
