'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Heading, Text, Input, Button } from '@thedot/design-system'
export default function ClientLogin() {
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false)
  async function send(e: React.FormEvent) {
    e.preventDefault()
    // Server-minted, scanner-proof sign-in email (see /api/client/auth/request-link). We route through
    // the app instead of supabase.auth.signInWithOtp so the emailed link points at the prefetch-proof
    // confirm page: mail-provider link scanners can no longer pre-consume the one-time token.
    try {
      await fetch('/api/client/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // Swallow: show the same confirmation regardless, so the UI reveals no error and no account signal.
    }
    // Always show the same confirmation, whatever the result, so the UI cannot be used to tell
    // whether an address has an account (network-level enumeration still needs rate limits/CAPTCHA).
    setSent(true)
  }
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--dot-cream)', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Image src="/images/logo.png" alt="The Dot Creative" width={80} height={50} priority style={{ marginBottom: 8 }} />
        <Heading level={2}>Your workspace</Heading>
        {sent ? <Text tone="grey">Check your email for a one-tap sign-in link.</Text> : (
          <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Text tone="grey">Enter your email and we will send a sign-in link.</Text>
            <Input label="Email" id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" />
            <Button type="submit" variant="black" style={{ width: '100%', textAlign: 'center' }}>Send me a link</Button>
          </form>
        )}
      </div>
    </main>
  )
}
