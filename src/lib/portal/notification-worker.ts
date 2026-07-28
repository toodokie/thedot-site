import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPortalNotificationEmail } from './notify'

type NotificationRow = {
  id: string
  claim_token: number
  recipient_kind: 'agency' | 'client'
  recipient_email: string | null
  subject: string
  body: string
  related_url: string | null
}

export type NotificationDrainResult = {
  claimed: number
  delivered: number
  failed: number
  skipped: boolean
  reason?: string
}

/**
 * Drain one bounded batch of agency and client email notifications. The database RPCs own leasing,
 * fencing, retry backoff, and abandonment. This function is shared by the Vercel cron route
 * and the local/ops CLI so there is only one delivery implementation.
 */
export async function drainPortalNotifications(
  admin: SupabaseClient,
  options: {
    agencyEmail?: string | null
    worker?: string
    limit?: number
    claimSeconds?: number
    maxAttempts?: number
  } = {},
): Promise<NotificationDrainResult> {
  const agencyEmail = options.agencyEmail ?? process.env.AGENCY_EMAIL ?? null

  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 20), 1), 100)
  const claimSeconds = Math.min(Math.max(Math.trunc(options.claimSeconds ?? 120), 30), 900)
  const maxAttempts = Math.min(Math.max(Math.trunc(options.maxAttempts ?? 6), 1), 20)
  const worker = options.worker ?? `notif-${process.pid}-${randomUUID()}`
  const { data, error } = await admin.rpc('claim_notification_batch', {
    p_worker: worker,
    p_limit: limit,
    p_claim_seconds: claimSeconds,
  })
  if (error) throw new Error(`claim notification batch: ${error.message}`)

  const rows = (data ?? []) as NotificationRow[]
  let delivered = 0
  let failed = 0
  for (const row of rows) {
    try {
      const recipient = row.recipient_kind === 'client' ? row.recipient_email : agencyEmail
      if (!recipient) {
        throw new Error(
          row.recipient_kind === 'client'
            ? 'client notification has no resolved recipient'
            : 'AGENCY_EMAIL is not configured',
        )
      }
      await sendPortalNotificationEmail({
        to: recipient,
        subject: row.subject,
        bodyText: row.body,
        url: row.related_url,
      })
      const completed = await admin.rpc('mark_notification_succeeded', {
        p_id: row.id,
        p_claim_token: row.claim_token,
      })
      if (completed.error) throw new Error(`mark succeeded: ${completed.error.message}`)
      delivered += 1
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : String(error)
      const marked = await admin.rpc('mark_notification_failed', {
        p_id: row.id,
        p_claim_token: row.claim_token,
        p_error: message.slice(0, 2000),
        p_max_attempts: maxAttempts,
      })
      if (marked.error) {
        console.error(`mark notification failed for ${row.id}: ${marked.error.message}`)
      }
    }
  }

  return { claimed: rows.length, delivered, failed, skipped: false }
}
