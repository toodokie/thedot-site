import styles from '../loading.module.css'

export default function PortalLoading() {
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label="Loading">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>Loading</span>
    </div>
  )
}
