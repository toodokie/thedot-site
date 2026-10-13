import type { Metadata } from 'next'

// The portal is private. Its link previews must never show the marketing site's card (inherited
// from the root layout) and must never show piece content to someone who cannot open the piece.
export const PORTAL_SITE_NAME = 'Kanset Portal'
export const PORTAL_DESCRIPTION = 'A private client workspace.'
export const PORTAL_NOINDEX = { index: false, follow: false } as const

export function clientDisplayName(slug: string): string {
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}

export function portalShareMetadata(
  title: string,
): Pick<Metadata, 'description' | 'openGraph' | 'twitter' | 'alternates'> {
  return {
    description: PORTAL_DESCRIPTION,
    openGraph: { title, description: PORTAL_DESCRIPTION, siteName: PORTAL_SITE_NAME, type: 'website' },
    twitter: { card: 'summary', title, description: PORTAL_DESCRIPTION },
    alternates: { canonical: null },
  }
}
