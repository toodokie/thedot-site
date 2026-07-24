'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import styles from './admin-shell.module.css'

// Left sidebar on desktop, bottom bar on mobile (admin-shell.module.css handles the responsive
// swap). Same structure as the CLIENT PortalNav so both sides of the portal read alike. These
// are MY agency surfaces: what to do (My tasks), where each piece stands (Pieces), the real
// posting record (Publication), the shared calendar, invoices, and Maria's change requests.
const ITEMS = [
  { label: 'My tasks', seg: '' },
  { label: 'Pieces', seg: 'pieces' },
  { label: 'Publication', seg: 'publication' },
  { label: 'Calendar', seg: 'calendar' },
  { label: 'Plan', seg: 'plan' },
  { label: 'Ideas', seg: 'ideas' },
  { label: 'Reports', seg: 'reports' },
  { label: 'Strategy', seg: 'strategy' },
  { label: 'Library', seg: 'library' },
  { label: 'Billing', seg: 'billing' },
  { label: 'Requests', seg: 'requests' },
]

export default function AdminNav({ seat }: { seat?: React.ReactNode }) {
  const pathname = usePathname()
  const base = '/admin/portal'
  return (
    <nav className={styles.nav} aria-label="Ops sections">
      <div className={styles.brand}>
        <Image src="/images/logo.png" alt="The Dot Creative" width={80} height={45} priority />
        {seat}
      </div>
      <ul className={styles.list}>
        {ITEMS.map((it) => {
          const href = it.seg ? `${base}/${it.seg}` : base
          const active = it.seg ? pathname === href || pathname.startsWith(href + '/') : pathname === base
          return (
            <li key={it.seg || 'my-tasks'}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={active ? `${styles.item} ${styles.active}` : styles.item}
              >
                {it.label}
              </Link>
            </li>
          )
        })}
        <li className={styles.foot}>
          <Link href="/admin/dashboard" className={`${styles.item} ${styles.footItem}`}>Dashboard</Link>
        </li>
      </ul>
    </nav>
  )
}
