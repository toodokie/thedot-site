'use client'
export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', fontFamily: "'futura-pt', Arial, sans-serif", color: 'var(--foreground)' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 18 }}>Something went wrong loading your workspace.</p>
        <button onClick={reset} style={{ marginTop: 12, padding: '10px 18px', borderRadius: 999, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>Try again</button>
      </div>
    </main>
  )
}
