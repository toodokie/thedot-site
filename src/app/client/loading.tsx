// Parent-level loading UI: covers the [slug] layout's auth lookup (the segment's own loading.tsx
// does not cover its layout). role/aria-live announce the loading state to assistive tech.
export default function PortalLoading() {
  return (
    <main role="status" aria-live="polite" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)', color: '#68665f', fontFamily: "'futura-pt', Arial, sans-serif" }}>
      Loading…
    </main>
  )
}
