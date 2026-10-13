const MUTED = '#68665f'

// Prefetch-proof sign-in step. The magic-link email points HERE (not straight at the callback), so a
// mail scanner that opens the link only renders this page; the single-use token is consumed only when
// a real person clicks the button, which POSTs to the confirm action.
export default async function Confirm(
  { searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string; next?: string }> },
) {
  const sp = await searchParams
  const tokenHash = sp.token_hash ?? ''
  const type = sp.type ?? 'email'
  const next = sp.next ?? '/client/kanset'
  const valid = tokenHash.length > 0
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)', color: 'var(--foreground)', fontFamily: "'futura-pt', Arial, sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, textAlign: 'center' }}>
        <h1 style={{ fontWeight: 300, fontSize: 32, marginBottom: 10 }}>Almost there</h1>
        {valid ? (
          <>
            <p style={{ color: MUTED, marginBottom: 24 }}>Click below to sign in to your workspace.</p>
            <form action="/client/auth/confirm/verify" method="post">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <button type="submit" style={{ padding: '14px 28px', fontSize: 15, borderRadius: 999, border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}>Sign in</button>
            </form>
          </>
        ) : (
          <p style={{ color: MUTED }}>
            This sign-in link is missing or invalid. Please request a new one from the{' '}
            <a href="/client/login" style={{ color: 'var(--foreground)' }}>login page</a>.
          </p>
        )}
      </div>
    </main>
  )
}
