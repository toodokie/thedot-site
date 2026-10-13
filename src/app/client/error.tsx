'use client'
// Parent-level boundary: catches errors thrown by the [slug] layout guard itself (e.g. a Supabase
// outage in getClientSession). A segment's own error.tsx does not catch errors in that segment's
// layout, so this sits one level up, above [slug].
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18 }}>Something went wrong loading your workspace.</p>
        <button onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Try again</button>
      </div>
    </main>
  )
}
