// Validate the post-sign-in `next` target so a crafted magic link cannot open-redirect off-origin
// after a valid authentication. String concatenation like `${origin}${next}` is unsafe: next=@evil.com
// yields https://host@evil.com whose real origin is evil.com (and %40 decodes to the same). Accept
// only a decoded, single-slash, same-origin portal path; otherwise fall back to the portal landing.
const FALLBACK = '/client/kanset'
// NOTE: FALLBACK is hardcoded to the single launch client (Kanset). Before adding a second client,
// derive the landing from the authenticated user's membership instead of a constant.

export function safeNext(raw: string | null, origin: string): URL {
  const fallback = new URL(FALLBACK, origin)
  // searchParams.get() has already decoded %40 / %2F / %5C, so these checks cover encoded variants.
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return fallback
  }
  try {
    const candidate = new URL(raw, origin)
    const isPortalPath =
      candidate.pathname === '/client' || candidate.pathname.startsWith('/client/')
    return candidate.origin === origin && isPortalPath ? candidate : fallback
  } catch {
    return fallback
  }
}
