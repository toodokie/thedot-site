import Image from 'next/image'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { verifySession } from '@/lib/auth'
import AdminNav from './AdminNav'
import styles from './admin-shell.module.css'
import PortalPwaRegistration from '@/components/PortalPwaRegistration'
// The @thedot/design-system --dot-* tokens (:root) + fonts. The admin route did NOT pull the
// design-system stylesheet (unlike the client portal), so every --admin-*: var(--dot-*) resolved
// to empty and all borders/backgrounds/accents silently dropped. This import guarantees the tokens
// exist on every admin surface. Verified via computed-style probe, 2026-07-22.
import '@thedot/design-system/styles.css'

// Private ops workspace: a real tab title, never indexed. Agency-only surface.
export const metadata: Metadata = {
  title: 'Portal ops · The Dot',
  // Installable-app manifest: opens straight to /admin/portal, own name + icon ("Kanset Ops").
  manifest: '/kanset-ops.webmanifest',
  robots: { index: false, follow: false },
}

// The whole /admin/portal tree lives inside the same shell as Maria's portal (sidebar on
// desktop, bottom bar on mobile). The layout guards once for every routed page; each page
// re-checks before it fetches. Nothing here is ever visible to a client.
export default async function PortalAdminLayout({ children }: { children: React.ReactNode }) {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const seat = <span className={styles.seat}>Agency ops</span>
  return (
    <div className={styles.shell}>
      <PortalPwaRegistration />
      <AdminNav seat={seat} />
      <div className={styles.content}>
        <header className={styles.topbar}>
          <Image src="/images/logo.png" alt="The Dot Creative" width={64} height={36} priority />
          {seat}
        </header>
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
