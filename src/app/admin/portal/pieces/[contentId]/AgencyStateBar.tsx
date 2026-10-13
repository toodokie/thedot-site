import { Button } from '@thedot/design-system'
import { adminPieceHref } from '@/lib/portal/admin-piece-href'
import styles from './agency-panel.module.css'

// The admin page's bottom bar: what Maria's own bar is showing, never an action on her behalf.
export default function AgencyStateBar({ contentId, clientSlug, line, released }: {
  contentId: string; clientSlug?: string; line: string; released: boolean
}) {
  return (
    <div className={styles.bar} role="region" aria-label="Maria's view">
      <span><span className={styles.barState}>Maria&apos;s view</span><span className={styles.barLine}>{line}</span></span>
      {released && <Button as="a" variant="ghost" size="sm"
        href={adminPieceHref(contentId, clientSlug, 'maria-preview')}>View as Maria</Button>}
    </div>
  )
}
