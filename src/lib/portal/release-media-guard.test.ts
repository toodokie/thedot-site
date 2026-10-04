import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ensureReleaseMedia, hasReleaseMedia, NO_MEDIA_PREFIX, parseReleaseMediaStatus, ReleaseMediaMissingError,
  releaseMediaRefusal, validateNoMediaReason,
} from './release-media-guard'

function fakeDb(status: Record<string, unknown>, override: { data?: unknown; error?: { message: string } | null } = {}) {
  const rpc = vi.fn(async (fn: string) => fn === 'agency_release_media_status'
    ? { data: status, error: null }
    : { data: override.data ?? { outcome: 'recorded' }, error: override.error ?? null })
  return { db: { rpc } as unknown as SupabaseClient, rpc }
}
const input = { clientId: 'c1', contentItemId: 'item-1', contentId: 'kanset-reel', version: 3, actorKey: 'thedot-admin' }
const NONE = { review_assets: 0, previews: 0, design_link: false, override_reason: null }

describe('validateNoMediaReason', () => {
  it('accepts the exact prefix with a reason and trims it', () => {
    expect(validateNoMediaReason('  Approved by Anastasia: article, no visual  ')).toBe('Approved by Anastasia: article, no visual')
    expect(validateNoMediaReason(undefined)).toBeNull()
    expect(validateNoMediaReason(null)).toBeNull()
  })

  it('refuses anything else', () => {
    for (const bad of ['approved by anastasia: lower case', 'Agency override authorized by Anastasia: wrong words',
      'Approved by Anastasia:', 'Approved by Anastasia: ok', `${NO_MEDIA_PREFIX} two\nlines`, `${NO_MEDIA_PREFIX} ${'x'.repeat(500)}`, 42]) {
      expect(() => validateNoMediaReason(bad)).toThrow(/Approved by Anastasia:/)
    }
  })
})

describe('status', () => {
  it('parses the database row and knows when media is present', () => {
    expect(parseReleaseMediaStatus({ review_assets: 1, previews: 0, design_link: false, override_reason: null }))
      .toEqual({ reviewAssets: 1, previews: 0, designLink: false, overrideReason: null })
    expect(hasReleaseMedia(parseReleaseMediaStatus(NONE))).toBe(false)
    expect(hasReleaseMedia(parseReleaseMediaStatus({ ...NONE, previews: 2 }))).toBe(true)
    expect(hasReleaseMedia(parseReleaseMediaStatus({ ...NONE, design_link: true }))).toBe(true)
    expect(parseReleaseMediaStatus(null)).toEqual({ reviewAssets: 0, previews: 0, designLink: false, overrideReason: null })
  })

  it('names what is missing and the way out', () => {
    const message = releaseMediaRefusal('kanset-reel', 3)
    expect(message).toContain('REFUSED: kanset-reel v3 has nothing for Maria to look at')
    expect(message).toContain('no review asset, no portal preview and no design link')
    expect(message).toContain('--no-media "Approved by Anastasia: <why>"')
    expect(message).toContain('"noMediaReason"')
  })
})

describe('ensureReleaseMedia', () => {
  it('passes when media is attached and records nothing', async () => {
    const { db, rpc } = fakeDb({ ...NONE, review_assets: 1 })
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: not needed here' })).toBe('media')
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('agency_release_media_status', { p_content_item_id: 'item-1', p_content_version: 3 })
  })

  it('passes on an override already on file', async () => {
    const { db, rpc } = fakeDb({ ...NONE, override_reason: 'Approved by Anastasia: article' })
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: null })).toBe('override')
    expect(rpc).toHaveBeenCalledTimes(1)
  })

  it('refuses with a named error when nothing is attached and no reason is given', async () => {
    const { db } = fakeDb(NONE)
    const refusal = ensureReleaseMedia(db, { ...input, noMediaReason: null })
    await expect(refusal).rejects.toBeInstanceOf(ReleaseMediaMissingError)
    await expect(ensureReleaseMedia(db, { ...input, noMediaReason: null })).rejects.toThrow(/kanset-reel v3/)
  })

  it('records the override for that exact version when a reason is given', async () => {
    const { db, rpc } = fakeDb(NONE)
    expect(await ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: text-only post' })).toBe('override')
    expect(rpc).toHaveBeenLastCalledWith('agency_record_release_media_override', {
      p_client_id: 'c1', p_content_id: 'kanset-reel', p_content_version: 3,
      p_reason: 'Approved by Anastasia: text-only post', p_actor_key: 'thedot-admin',
    })
  })

  it('surfaces a refused override instead of releasing', async () => {
    const { db } = fakeDb(NONE, { error: { message: 'v3 already has a no-media override with a different reason' } })
    await expect(ensureReleaseMedia(db, { ...input, noMediaReason: 'Approved by Anastasia: another reason' }))
      .rejects.toThrow(/different reason/)
  })
})
