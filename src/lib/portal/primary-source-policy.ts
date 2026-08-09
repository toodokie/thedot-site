// Version-controlled source hosts accepted in client-facing fact-check ledgers.
// Official regulatory sources and reviewed original research publishers stay separate so adding a
// ranking publisher does not weaken the immigration-policy boundary. The exported union remains in
// parity with the database validator. Host matching is exact or a real subdomain boundary.
export const OFFICIAL_PRIMARY_SOURCE_HOSTS = [
  'canada.ca',
  'college-ic.ca',
  'gazette.gc.ca',
  'ontario.ca',
] as const

export const REVIEWED_RESEARCH_SOURCE_HOSTS = [
  'henleyglobal.com',
  'transparency.org',
  'usnews.com',
  'who.int',
  'worldbank.org',
] as const

export const PRIMARY_SOURCE_HOSTS = [
  ...OFFICIAL_PRIMARY_SOURCE_HOSTS,
  ...REVIEWED_RESEARCH_SOURCE_HOSTS,
] as const

export function isAllowedPrimarySourceHostname(hostname: string): boolean {
  const candidate = hostname.toLowerCase().replace(/\.$/, '')
  return PRIMARY_SOURCE_HOSTS.some(
    (allowed) => candidate === allowed || candidate.endsWith(`.${allowed}`),
  )
}

export function parsePrimarySourceUrl(value: string, source: string): string {
  if (value.length > 2048) throw new Error(`source_url is too long in ${source}`)
  if (/\p{C}/u.test(value)) throw new Error(`source_url contains control characters in ${source}`)

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`source_url must be a valid HTTPS URL in ${source}`)
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error(`source_url must be an HTTPS URL without credentials in ${source}`)
  }
  if (!isAllowedPrimarySourceHostname(parsed.hostname)) {
    throw new Error(`source_url host is not an approved primary source in ${source}`)
  }

  return parsed.toString()
}
