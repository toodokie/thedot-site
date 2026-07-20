import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'
import { getClientSession } from '@/lib/portal/auth'

// Server wrapper: turns ?error= into a visible, human explanation. Without this, a dead sign-in link
// silently re-rendered the email form, which reads as an endless login loop.
const NOTICES: Record<string, string> = {
  auth: 'That sign-in link did not work. It may have expired or already been used (only the newest link is valid). Enter your email below for a fresh one.',
  expired: 'That sign-in link has expired or was already used. Only the newest link is valid, so enter your email below and use the latest email.',
  service: 'We could not reach the sign-in service just now. Your account and link are fine; please try again in a minute.',
}

export default async function ClientLogin(
  { searchParams }: { searchParams: Promise<{ error?: string }> },
) {
  // Already signed in -> straight to the workspace. Browsers preload pasted/typed links before Enter,
  // which can consume a one-time sign-in link AND establish the session invisibly; without this check
  // the user then stares at the email form while actually authenticated ("the endless loop").
  // 'kanset' matches the single-client FALLBACK in portal/redirect.ts; derive from membership when a
  // second client is added. An auth outage is surfaced as a service notice, never disguised as
  // "logged out" (Codex review 2026-07-20).
  let signedIn = false
  let outage = false
  try {
    signedIn = (await getClientSession('kanset')) !== null
  } catch {
    outage = true
  }
  if (signedIn) redirect('/client/kanset') // outside the try: redirect() throws internally by design
  const { error } = await searchParams
  const notice = outage ? NOTICES.service : error ? NOTICES[error] ?? NOTICES.auth : undefined
  return <LoginForm notice={notice} />
}
