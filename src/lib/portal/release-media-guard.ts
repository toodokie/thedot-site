import type { SupabaseClient } from '@supabase/supabase-js'

// Release media guard (migration 0092, amended 2026-10-03). A version reaches Maria only with a
// review asset, a portal preview or a design link, or with an override for that exact version
// whose reason starts "Approved by Anastasia:". The database enforces it on every release; this
// module lets the agency scripts refuse first, name what is missing, and record the override.
// No server-only import: the tsx scripts use it with the service-role client.

export const NO_MEDIA_PREFIX = 'Approved by Anastasia:'

export type ReleaseMediaStatus = {
  reviewAssets: number
  previews: number
  designLink: boolean
  overrideReason: string | null
}

export class ReleaseMediaMissingError extends Error {
  readonly missing: string[]
  constructor(message: string) {
    super(message)
    this.name = 'ReleaseMediaMissingError'
    this.missing = ['review_asset', 'portal_preview', 'design_link']
  }
}

const CONTROL = /[\u0000-\u001f\u007f]/

export function validateNoMediaReason(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null
  const reason = typeof raw === 'string' ? raw.trim() : ''
  if (!reason.startsWith(NO_MEDIA_PREFIX) || reason.slice(NO_MEDIA_PREFIX.length).trim().length < 3
      || reason.length > 500 || CONTROL.test(reason)) {
    throw new Error(`a no-media override must start "${NO_MEDIA_PREFIX}" and say why, on one line, in at most 500 characters`)
  }
  return reason
}

export function parseReleaseMediaStatus(raw: unknown): ReleaseMediaStatus {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const count = (value: unknown) => {
    const number = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(number) ? number : 0
  }
  return {
    reviewAssets: count(row.review_assets),
    previews: count(row.previews),
    designLink: row.design_link === true,
    overrideReason: typeof row.override_reason === 'string' ? row.override_reason : null,
  }
}

export function hasReleaseMedia(status: ReleaseMediaStatus): boolean {
  return status.reviewAssets > 0 || status.previews > 0 || status.designLink
}

export function releaseMediaRefusal(contentId: string, version: number): string {
  return [
    `REFUSED: ${contentId} v${version} has nothing for Maria to look at: no review asset, no portal preview and no design link.`,
    `   Attach one to v${version} (portal-write review-asset, review-preview or design-link), then release again.`,
    `   Only with Anastasia's written approval: --no-media "${NO_MEDIA_PREFIX} <why>" (in a portal-write payload, "noMediaReason").`,
  ].join('\n')
}

export async function ensureReleaseMedia(
  db: SupabaseClient,
  input: {
    clientId: string
    contentItemId: string
    contentId: string
    version: number
    noMediaReason: string | null
    actorKey: string
  },
): Promise<'media' | 'override'> {
  const status = await db.rpc('agency_release_media_status', {
    p_content_item_id: input.contentItemId, p_content_version: input.version,
  })
  if (status.error) throw new Error(`release media check failed: ${status.error.message}`)
  const parsed = parseReleaseMediaStatus(status.data)
  if (hasReleaseMedia(parsed)) return 'media'
  if (parsed.overrideReason) return 'override'
  if (!input.noMediaReason) throw new ReleaseMediaMissingError(releaseMediaRefusal(input.contentId, input.version))
  const recorded = await db.rpc('agency_record_release_media_override', {
    p_client_id: input.clientId, p_content_id: input.contentId, p_content_version: input.version,
    p_reason: input.noMediaReason, p_actor_key: input.actorKey,
  })
  if (recorded.error) throw new Error(`no-media override refused: ${recorded.error.message}`)
  return 'override'
}
