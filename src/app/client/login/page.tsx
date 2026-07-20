import LoginForm from './LoginForm'

// Server wrapper: turns ?error= into a visible, human explanation. Without this, a dead sign-in link
// silently re-rendered the email form, which reads as an endless login loop.
const NOTICES: Record<string, string> = {
  auth: 'That sign-in link did not work. It may have expired or already been used (only the newest link is valid). Enter your email below for a fresh one.',
  expired: 'That sign-in link has expired or was already used. Only the newest link is valid, so enter your email below and use the latest email.',
}

export default async function ClientLogin(
  { searchParams }: { searchParams: Promise<{ error?: string }> },
) {
  const { error } = await searchParams
  return <LoginForm notice={error ? NOTICES[error] ?? NOTICES.auth : undefined} />
}
