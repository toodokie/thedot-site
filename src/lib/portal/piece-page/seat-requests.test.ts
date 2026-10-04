import { describe, expect, it, vi } from 'vitest'
import { seatRequestIdsFrom, type BundleReader } from './seat-requests'

function reader(result: { data: unknown; error: { message: string } | null } | Error) {
  const calls: Array<[string, unknown]> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { calls.push([column, value]); return query }),
    then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) =>
      (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)).then(resolve, reject),
  }
  const db = { from: vi.fn(() => query) } as unknown as BundleReader
  return { db, calls, query }
}

const where = { clientId: 'client-1', contentItemId: 'item-1', userId: 'user-1' }

describe('seatRequestIdsFrom', () => {
  it('reads the request ids of the bundles this seat sent for the piece', async () => {
    const { db, calls, query } = reader({ data: [{ request_ids: ['r1', 'r2'] }, { request_ids: ['r3'] }], error: null })
    expect(await seatRequestIdsFrom(db, where)).toEqual(['r1', 'r2', 'r3'])
    expect(db.from).toHaveBeenCalledWith('content_edit_review_bundles')
    expect(query.select).toHaveBeenCalledWith('request_ids')
    expect(calls).toEqual([['client_id', 'client-1'], ['content_id', 'item-1'], ['requested_by', 'user-1']])
  })

  it('fails closed: a failed or thrown read gives no ids, never everyone\'s', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(await seatRequestIdsFrom(reader({ data: null, error: { message: 'denied' } }).db, where)).toEqual([])
    expect(await seatRequestIdsFrom(reader(new Error('down')).db, where)).toEqual([])
    expect(await seatRequestIdsFrom(reader({ data: [{ request_ids: 'bad' }], error: null }).db, where)).toEqual([])
  })

  it('reads nothing without a seat', async () => {
    const { db } = reader({ data: [], error: null })
    expect(await seatRequestIdsFrom(db, { ...where, userId: null })).toEqual([])
    expect(db.from).not.toHaveBeenCalled()
  })
})
