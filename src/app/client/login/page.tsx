'use client'
import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase/client'
export default function ClientLogin() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    const supabase = createSupabaseBrowser()
    const base = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const callback = new URL('/client/auth/callback', base).toString() // no double slash on a trailing-slash base
    await supabase.auth.signInWithOtp({
      email, options: { shouldCreateUser: false, emailRedirectTo: callback },
    })
    // Always show the same confirmation, whatever the result, so the UI cannot be used to tell
    // whether an address has an account (network-level enumeration still needs rate limits/CAPTCHA).
    setSent(true)
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--background)',
      color: 'var(--foreground)', fontFamily: "'futura-pt', Arial, sans-serif", padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ fontWeight: 300, fontSize: 34, marginBottom: 8 }}>Your workspace</h1>
        {sent ? <p style={{ color: 'var(--dim-grey)' }}>Check your email for a one-tap sign-in link.</p> : (
          <form onSubmit={send}>
            <p style={{ color: 'var(--dim-grey)', marginBottom: 20 }}>Enter your email and we will send a sign-in link.</p>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              style={{ width: '100%', padding: '14px 16px', fontSize: 16, borderRadius: 6, border: '1px solid #ccc', background: '#fff', marginBottom: 14 }} />
            <button type="submit" style={{ width: '100%', padding: '14px 16px', fontSize: 15, borderRadius: 999,
              border: 'none', background: 'var(--foreground)', color: 'var(--background)', cursor: 'pointer' }}>Send me a link</button>
          </form>
        )}
      </div>
    </main>
  )
}
