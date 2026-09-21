import { redirect } from 'next/navigation'
import LoginForm from './LoginForm'
import { getClientSession } from '@/lib/portal/auth'
import { safeNext } from '@/lib/portal/redirect'

// Server wrapper: turns ?error= into a visible, human explanation. Without this, a dead sign-in link
// silently re-rendered the email form, which reads as an endless login loop.
const NOTICES: Record<string, string> = {
  auth: 'That sign-in link did not work. It may have expired or already been used (only the newest link is valid). Enter your email below for a fresh one.',
  expired: 'That sign-in link has expired or was already used. Only the newest link is valid, so enter your email below and use the latest email.',
  service: 'We could not reach the sign-in service just now. Your account and link are fine; please try again in a minute.',
}

export default async function ClientLogin(
  { searchParams }: { searchParams: Promise<{ error?: string; next?: string }> },
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
  const { error, next: rawNext } = await searchParams
  // The page she was sent to, preserved through the sign-in so a shared piece link opens the piece.
  // safeNext rejects anything that is not a same-origin /client path, so a crafted link cannot
  // redirect her off the site after a real authentication. ORIGIN is only a parsing base here.
  const destination = safeNext(rawNext ?? null, 'https://www.thedotcreative.co')
  const next = `${destination.pathname}${destination.search}`
  // outside the try: redirect() throws internally by design
  if (signedIn) redirect(next)
  const notice = outage ? NOTICES.service : error ? NOTICES[error] ?? NOTICES.auth : undefined
  return <LoginForm notice={notice} next={next} />
}
