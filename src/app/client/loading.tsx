import styles from './loading.module.css'

// Parent-level loading UI covers the [slug] layout's auth lookup. The fixed surface also keeps
// slow data reads from exposing a half-rendered page underneath.
export default function PortalLoading() {
  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-label="Loading">
      <span className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>Loading</span>
    </div>
  )
}
