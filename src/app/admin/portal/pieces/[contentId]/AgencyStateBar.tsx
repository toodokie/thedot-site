import { Button } from '@thedot/design-system'
import styles from './agency-panel.module.css'

// The admin page's bottom bar: what Maria's own bar is showing, never an action on her behalf.
export default function AgencyStateBar({ contentId, line, released }: { contentId: string; line: string; released: boolean }) {
  return (
    <div className={styles.bar} role="region" aria-label="Maria's view">
      <span><span className={styles.barState}>Maria&apos;s view</span><span className={styles.barLine}>{line}</span></span>
      {released && <Button as="a" variant="ghost" size="sm"
        href={`/admin/portal/pieces/${encodeURIComponent(contentId)}/maria-preview`}>View as Maria</Button>}
    </div>
  )
}
