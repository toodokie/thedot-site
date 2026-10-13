import type { SupabaseClient } from '@supabase/supabase-js'
import { REVIEW_PREVIEW_BUCKET } from './review-preview-core'

// Retention for portal review previews (migration 0092, spec 7). The database decides WHAT to
// retire and queues the object paths; only the Storage API can delete objects, so this module
// drains the queue and reports each removal back, which writes the activity row.

export type RetiredPreview = { preview_id: string; reason: string }
export type RetentionResult = { retired: number; removed: number; failed: number }

export async function retireReviewPreviews(
  admin: SupabaseClient,
  options: { now: Date; contentItemId?: string | null },
): Promise<RetiredPreview[]> {
  const { data, error } = await admin.rpc('agency_retire_review_previews', {
    p_now: options.now.toISOString(),
    p_content_item_id: options.contentItemId ?? null,
  })
  if (error) throw new Error(`agency_retire_review_previews: ${error.message}`)
  return (data ?? []) as RetiredPreview[]
}

export async function drainReviewPreviewRemovals(
  admin: SupabaseClient,
  options: { limit?: number } = {},
): Promise<{ removed: number; failed: number }> {
  const { data, error } = await admin.rpc('agency_pending_review_preview_removals', {
    p_limit: options.limit ?? 200,
  })
  if (error) throw new Error(`agency_pending_review_preview_removals: ${error.message}`)
  let removed = 0
  let failed = 0
  for (const row of (data ?? []) as Array<{ id: string; object_paths: string[] }>) {
    let failure: string | null = null
    if (row.object_paths.length > 0) {
      const { error: removeError } = await admin.storage.from(REVIEW_PREVIEW_BUCKET).remove(row.object_paths)
      if (removeError) failure = removeError.message.slice(0, 500)
    }
    const { error: completeError } = await admin.rpc('agency_complete_review_preview_removal', {
      p_removal_id: row.id,
      p_error: failure,
    })
    if (completeError) throw new Error(`agency_complete_review_preview_removal: ${completeError.message}`)
    if (failure) failed += 1
    else removed += 1
  }
  return { removed, failed }
}

export async function runPreviewRetention(
  admin: SupabaseClient,
  options: { now?: Date; contentItemId?: string | null; limit?: number } = {},
): Promise<RetentionResult> {
  const retired = await retireReviewPreviews(admin, {
    now: options.now ?? new Date(),
    contentItemId: options.contentItemId ?? null,
  })
  const drained = await drainReviewPreviewRemovals(admin, { limit: options.limit })
  return { retired: retired.length, ...drained }
}

// Called right after a publication is confirmed (portal-write publication-confirm, portal-ship,
// and the admin Publication surface). The confirmation has already committed, so a failure here
// must never turn it into an error; the nightly cron catches anything left behind.
export async function purgePreviewsAfterPublication(
  admin: SupabaseClient,
  contentItemId: string,
  log: (message: string) => void = console.warn,
): Promise<RetentionResult | null> {
  try {
    return await runPreviewRetention(admin, { contentItemId })
  } catch (error) {
    log(`WARN: preview retention after publication failed; the nightly sweep will retry: ${
      error instanceof Error ? error.message : String(error)}`)
    return null
  }
}
