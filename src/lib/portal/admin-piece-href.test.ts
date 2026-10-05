import { describe, expect, it } from 'vitest'
import { adminPieceHref } from './admin-piece-href'

describe('adminPieceHref', () => {
  it('carries the client so a piece of any client opens', () => {
    expect(adminPieceHref('acme-reel', 'acme')).toBe('/admin/portal/pieces/acme-reel?client=acme')
    expect(adminPieceHref('acme-reel', 'acme', 'maria-preview')).toBe('/admin/portal/pieces/acme-reel/maria-preview?client=acme')
  })

  it('keeps the bare link when no client is known', () => {
    expect(adminPieceHref('kanset-reel')).toBe('/admin/portal/pieces/kanset-reel')
    expect(adminPieceHref('kanset-reel', null, 'maria-preview')).toBe('/admin/portal/pieces/kanset-reel/maria-preview')
  })

  it('encodes both parts', () => {
    expect(adminPieceHref('a b', 'c&d')).toBe('/admin/portal/pieces/a%20b?client=c%26d')
  })
})
