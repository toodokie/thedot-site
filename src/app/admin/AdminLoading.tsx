import styles from './portal/portal-admin.module.css'

// Shared loading surface for the agency area. Nested portal routes reuse this same boundary.
export default function AdminLoading() {
  return (
    <div className={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Loading">
      <span className={styles.loadingSpinner} aria-hidden="true" />
      <span className={styles.loadingText}>Loading</span>
    </div>
  )
}
