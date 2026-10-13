import { describe, expect, it } from 'vitest'
import { pickPreviewSeat, resolvePieceClient } from './piece-client'
import { fakeAdmin } from './fake-admin.test-helper'

const clients = [
  { id: 'c-kanset', slug: 'kanset', name: 'Kanset Services Inc.' },
  { id: 'c-acme', slug: 'acme', name: 'Acme Co' },
]
const items = [
  { id: 'item-k', client_id: 'c-kanset', content_id: 'k-piece' },
  { id: 'item-a', client_id: 'c-acme', content_id: 'a-piece' },
  { id: 'item-sk', client_id: 'c-kanset', content_id: 'shared' },
  { id: 'item-sa', client_id: 'c-acme', content_id: 'shared' },
]
const admin = () => fakeAdmin({ clients, content_items: items })

describe('resolvePieceClient', () => {
  it('finds a non-kanset piece by its content_id alone', async () => {
    expect(await resolvePieceClient(admin(), 'a-piece')).toEqual({ kind: 'found', clientId: 'c-acme', slug: 'acme' })
  })

  it('still finds a kanset piece', async () => {
    expect(await resolvePieceClient(admin(), 'k-piece')).toEqual({ kind: 'found', clientId: 'c-kanset', slug: 'kanset' })
  })

  it('reports a content_id two clients share instead of guessing, and the client param settles it', async () => {
    expect(await resolvePieceClient(admin(), 'shared')).toEqual({
      kind: 'ambiguous',
      clients: [{ slug: 'acme', name: 'Acme Co' }, { slug: 'kanset', name: 'Kanset Services Inc.' }],
    })
    expect(await resolvePieceClient(admin(), 'shared', 'acme')).toEqual({ kind: 'found', clientId: 'c-acme', slug: 'acme' })
    expect(await resolvePieceClient(admin(), 'shared', 'c-kanset')).toEqual({ kind: 'found', clientId: 'c-kanset', slug: 'kanset' })
  })

  it('is missing when the piece is unknown or not under the named client', async () => {
    expect(await resolvePieceClient(admin(), 'nope')).toEqual({ kind: 'missing' })
    expect(await resolvePieceClient(admin(), 'a-piece', 'kanset')).toEqual({ kind: 'missing' })
  })
})

describe('pickPreviewSeat', () => {
  const rows = [
    { client_id: 'c-kanset', email: 'maria@kanset.com', name: 'Maria', can_decide: true },
    { client_id: 'c-acme', email: 'viewer@acme.test', name: 'Viewer', can_decide: false },
    { client_id: 'c-acme', email: 'boss@acme.test', name: 'Boss', can_decide: true },
  ]
  it('keeps Maria for Kanset', () => {
    expect(pickPreviewSeat(rows, 'c-kanset')?.email).toBe('maria@kanset.com')
  })
  it('uses the deciding seat of another client', () => {
    expect(pickPreviewSeat(rows, 'c-acme')?.email).toBe('boss@acme.test')
  })
  it('returns nothing when the client has no deciding seat', () => {
    expect(pickPreviewSeat(rows, 'c-none')).toBeUndefined()
  })
})
