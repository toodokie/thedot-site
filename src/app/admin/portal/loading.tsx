import styles from './portal-admin.module.css'

// Shared loading boundary for every agency portal route. The fixed surface keeps a
// slow service-role read from exposing a half-rendered table or stale page underneath.
export default function PortalAdminLoading() {
  return (
    <div className={styles.loadingOverlay} role="status" aria-live="polite" aria-label="Loading">
      <span className={styles.loadingSpinner} aria-hidden="true" />
      <span className={styles.loadingText}>Loading</span>
    </div>
  )
}
