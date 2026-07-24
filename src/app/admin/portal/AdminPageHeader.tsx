import { Eyebrow, Heading, Text } from '@thedot/design-system'
import styles from './portal-admin.module.css'

// The page masthead, IDENTICAL in shape to the client portal's per-surface header
// (eyebrow kicker -> display/section Heading -> roomy intro -> optional status count with the
// yellow-highlighter number). Built from the SAME design-system components the client uses, so
// my side reads as designed as Maria's, not a bare table. `display` = the big greeting size
// (the landing / My tasks); sub-pages use the level-2 section heading.
export default function AdminPageHeader({ kicker, title, intro, display, count, countLabel }: {
  kicker: string
  title: string
  intro?: string
  display?: boolean
  count?: number
  countLabel?: string
}) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageKicker}><Eyebrow tone="grey">{kicker}</Eyebrow></div>
      <Heading level={display ? 1 : 2} variant={display ? 'display' : 'section'}>{title}</Heading>
      {intro && <Text size="lg" tone="graphite" className={styles.pageIntro}>{intro}</Text>}
      {typeof count === 'number' && (
        <p className={styles.pageStatus}>
          <span className={styles.statusCount}>{count}</span> {countLabel}
        </p>
      )}
    </header>
  )
}
