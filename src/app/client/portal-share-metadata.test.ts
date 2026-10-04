import { describe, expect, it } from 'vitest'
import { clientDisplayName, PORTAL_NOINDEX, portalShareMetadata } from './portal-share-metadata'

describe('portal share metadata', () => {
  it('names the client from its slug', () => {
    expect(clientDisplayName('kanset')).toBe('Kanset')
    expect(clientDisplayName('')).toBe('')
  })

  it('never indexes a portal page', () => {
    expect(PORTAL_NOINDEX).toEqual({ index: false, follow: false })
  })

  it('replaces the marketing Open Graph and Twitter cards with the given title', () => {
    const meta = portalShareMetadata('Kanset · Foreign worker cost')
    expect(meta.openGraph).toEqual({
      title: 'Kanset · Foreign worker cost',
      description: 'A private client workspace.',
      siteName: 'Kanset Portal',
      type: 'website',
    })
    expect(meta.twitter).toEqual({
      card: 'summary',
      title: 'Kanset · Foreign worker cost',
      description: 'A private client workspace.',
    })
    expect(meta.description).toBe('A private client workspace.')
    expect(meta.alternates).toEqual({ canonical: null })
  })

  it('carries nothing from the marketing site', () => {
    expect(JSON.stringify(portalShareMetadata('Kanset Portal'))).not.toMatch(/Dot Creative|Poster|thedotcreative/)
  })
})
