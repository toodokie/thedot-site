// Exact public Kanset contacts that may legitimately appear in client-facing social copy.
// Claude's workflow-source inventory owns additions; never add a private/client-case contact here.
export const PUBLIC_CONTACT_EMAILS = [] as const
export const PUBLIC_CONTACT_PHONES = ['16477484022'] as const
export const PUBLIC_SOCIAL_HANDLES = ['kansetimmigration'] as const
export const PUBLIC_RCIC_NUMBERS = ['508325'] as const

// Links rendered in client-facing portal content must stay on a reviewed host.
// Facebook and LinkedIn paths still identify Kanset's public profiles:
// facebook.com/kansetimmigration and linkedin.com/company/kanset-services.
export const CLIENT_VISIBLE_LINK_HOSTS = [
  'kanset.com',
  'canva.com',
  'drive.google.com',
  'docs.google.com',
  'youtube.com',
  'youtu.be',
  'instagram.com',
  'facebook.com',
  'linkedin.com',
  'www.thedotcreative.co',
] as const

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, '')
}

export function isAllowedPublicEmail(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return PUBLIC_CONTACT_EMAILS.some((allowed) => normalized === allowed)
}

export function isAllowedPublicPhone(value: string): boolean {
  const normalized = normalizePhone(value)
  return PUBLIC_CONTACT_PHONES.some((allowed) => normalized === allowed)
}

export function isAllowedPublicSocialHandle(value: string): boolean {
  const normalized = value.trim().toLowerCase().replace(/^@/, '')
  return PUBLIC_SOCIAL_HANDLES.some((allowed) => normalized === allowed)
}

export function isAllowedPublicRcicNumber(value: string): boolean {
  const normalized = value.replace(/\D/g, '')
  return PUBLIC_RCIC_NUMBERS.some((allowed) => normalized === allowed)
}

export function isAllowedClientVisibleHostname(hostname: string): boolean {
  const candidate = hostname.toLowerCase().replace(/\.$/, '')
  return CLIENT_VISIBLE_LINK_HOSTS.some(
    (allowed) => candidate === allowed || candidate.endsWith(`.${allowed}`),
  )
}
