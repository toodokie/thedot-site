// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'
import {
  drainReviewPreviewRemovals, purgePreviewsAfterPublication, runPreviewRetention,
} from './review-preview-retention'

type Call = { fn: string; args: Record<string, unknown> }

function fakeAdmin(options: {
  retired?: Array<{ preview_id: string; reason: string }>
  pending?: Array<{ id: string; object_paths: string[] }>
  removeError?: string
  retireError?: string
} = {}) {
  const calls: Call[] = []
  const removed: Array<{ bucket: string; paths: string[] }> = []
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args })
      if (fn === 'agency_retire_review_previews') {
        return options.retireError
          ? { data: null, error: { message: options.retireError } }
          : { data: options.retired ?? [], error: null }
      }
      if (fn === 'agency_pending_review_preview_removals') return { data: options.pending ?? [], error: null }
      if (fn === 'agency_complete_review_preview_removal') return { data: { outcome: 'completed' }, error: null }
      throw new Error(`unexpected rpc ${fn}`)
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          removed.push({ bucket, paths })
          return options.removeError ? { data: null, error: { message: options.removeError } } : { data: [], error: null }
        },
      }),
    },
  }
  return { admin: admin as unknown as SupabaseClient, calls, removed }
}

describe('runPreviewRetention', () => {
  it('retires as of the given time, then deletes the queued objects and completes each removal', async () => {
    const { admin, calls, removed } = fakeAdmin({
      retired: [{ preview_id: 'p1', reason: 'planned_date_past' }],
      pending: [{ id: 'r1', object_paths: ['a/video.mp4', 'a/poster.jpg'] }],
    })
    const result = await runPreviewRetention(admin, { now: new Date('2027-07-29T16:00:00Z'), contentItemId: 'i1' })
    expect(calls[0]).toEqual({ fn: 'agency_retire_review_previews', args: { p_now: '2027-07-29T16:00:00.000Z', p_content_item_id: 'i1' } })
    expect(removed).toEqual([{ bucket: REVIEW_PREVIEW_BUCKET, paths: ['a/video.mp4', 'a/poster.jpg'] }])
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r1', p_error: null } })
    expect(result).toEqual({ retired: 1, removed: 1, failed: 0 })
  })

  it('completes a removal whose paths are all reused by a current preview without touching storage', async () => {
    const { admin, calls, removed } = fakeAdmin({ pending: [{ id: 'r2', object_paths: [] }] })
    const result = await drainReviewPreviewRemovals(admin)
    expect(removed).toEqual([])
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r2', p_error: null } })
    expect(result).toEqual({ removed: 1, failed: 0 })
  })

  it('records a storage failure on the removal instead of completing it', async () => {
    const { admin, calls } = fakeAdmin({ pending: [{ id: 'r3', object_paths: ['x'] }], removeError: 'storage down' })
    const result = await drainReviewPreviewRemovals(admin)
    expect(calls).toContainEqual({ fn: 'agency_complete_review_preview_removal', args: { p_removal_id: 'r3', p_error: 'storage down' } })
    expect(result).toEqual({ removed: 0, failed: 1 })
  })
})

describe('purgePreviewsAfterPublication', () => {
  it('never fails the publication confirmation it follows; the nightly sweep retries', async () => {
    const { admin } = fakeAdmin({ retireError: 'database down' })
    const log = vi.fn()
    await expect(purgePreviewsAfterPublication(admin, 'i1', log)).resolves.toBeNull()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('nightly sweep will retry'))
  })

  it('scopes the purge to the confirmed piece', async () => {
    const { admin, calls } = fakeAdmin()
    await purgePreviewsAfterPublication(admin, 'item-9')
    expect(calls[0].args.p_content_item_id).toBe('item-9')
  })
})
