// Version-controlled primary-source hosts accepted in client-facing fact-check ledgers.
// Keep this list in parity with the database allow-list added by the release-quality migration.
// Host matching is exact or a real subdomain boundary; lookalikes such as evilcanada.ca fail.
export const PRIMARY_SOURCE_HOSTS = [
  'canada.ca',
  'college-ic.ca',
  'gazette.gc.ca',
  'ontario.ca',
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
