'use client'
import { useState } from 'react'
import Image from 'next/image'
import { createSupabaseBrowser } from '@/lib/supabase/client'
import { Heading, Text, Input, Button } from '@thedot/design-system'
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
