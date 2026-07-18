'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import styles from './portal-shell.module.css'

// Left sidebar on desktop, bottom bar on mobile (portal-shell.module.css handles the responsive swap).
// "Library" is one route (/library) holding both brand + video sections; Plan is reached from here
// and via calendar deep-links.
const ITEMS = [
  { label: 'Overview', seg: '' },
  { label: 'Calendar', seg: 'calendar' },
  { label: 'Plan', seg: 'plan' },
  { label: 'Ideas', seg: 'ideas' },
  { label: 'Strategy', seg: 'strategy' },
  { label: 'Reports', seg: 'reports' },
  { label: 'Library', seg: 'library' },
]

export default function PortalNav({ slug }: { slug: string }) {
  const pathname = usePathname()
  const base = `/client/${slug}`
  return (
    <nav className={styles.nav} aria-label="Portal sections">
      <div className={styles.brand}>
        <Image src="/images/logo.png" alt="The Dot Creative" width={80} height={45} priority />
      </div>
      <ul className={styles.list}>
        {ITEMS.map((it) => {
          const href = it.seg ? `${base}/${it.seg}` : base
          const active = it.seg ? pathname === href || pathname.startsWith(href + '/') : pathname === base
          return (
            <li key={it.seg || 'overview'}>
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
      </ul>
    </nav>
  )
}
