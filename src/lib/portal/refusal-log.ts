import 'server-only'
import { randomUUID } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// When the portal refuses a client edit, the client sees a message and we see nothing at all. A
// piece she tried and failed to change then looks exactly like a piece she read and was content
// with, because silence is the only signal either way. That is how the ep3 article nearly published
// against edits she had tried to send; the only reason anyone knew was that she texted Anastasia.
//
// This writes the attempt down, INCLUDING her wording, so a refused edit stops being a lost edit:
// her text can be applied without asking her to write it twice. Until now it survived only in her
// own browser, on one device.
//
// Nothing here may ever change what the caller returns. A logging failure is a worse outcome than
// an unlogged refusal, so every path swallows and reports to the server log instead.

// Must stay in step with the check constraint in migration 0089.
export type RefusalReason =
  | 'cannot_submit_requests'
  | 'expired_review'
  | 'empty_bundle'
  | 'draft_too_long'
  | 'draft_invalid'
  | 'url_invalid'
  | 'note_too_long'
  | 'piece_unavailable'
  | 'version_stale'
  | 'revision_in_progress'
  | 'stale_or_locked'
  | 'rate_limited'
  | 'write_failed'

export type RefusedDraft = {
  targetKind?: string | null
  targetKey?: string | null
  targetLabel?: string | null
  proposedText?: string | null
}

export type RefusalRecord = {
  clientId: string
  reason: RefusalReason
  clientMessage: string
  contentItemId?: string | null
  contentId?: string | null
  contentVersion?: number | null
  requestedBy?: string | null
  requesterName?: string | null
  drafts?: RefusedDraft[]
}

// Well under the 200,000 the table accepts, and four times the 50,000 the edit path allows, so a
// refusal never truncates the thing it exists to preserve.
const TEXT_CAP = 200000

export async function recordRefusal(record: RefusalRecord): Promise<void> {
  try {
    const attemptId = randomUUID()
    const drafts = record.drafts?.length ? record.drafts : [{}]
    const rows = drafts.map((draft) => {
      const text = typeof draft.proposedText === 'string' ? draft.proposedText : null
      return {
        attempt_id: attemptId,
        client_id: record.clientId,
        content_item_id: record.contentItemId ?? null,
        content_id: record.contentId ?? null,
        content_version: record.contentVersion ?? null,
        target_kind: draft.targetKind ?? null,
        target_key: draft.targetKey ?? null,
        target_label: draft.targetLabel ?? null,
        reason_code: record.reason,
        client_message: record.clientMessage,
        proposed_text: text === null ? null : text.slice(0, TEXT_CAP),
        // The TRUE length, before the cap above, so an over-long attempt is recognisable as one.
        proposed_length: text === null ? null : text.length,
        requested_by: record.requestedBy ?? null,
        requester_name: record.requesterName ?? null,
      }
    })
    const { error } = await createSupabaseAdmin().from('client_request_failures').insert(rows)
    if (error) console.error('refusal log write failed:', error.message)
  } catch (error) {
    console.error('refusal log threw:', error instanceof Error ? error.message : String(error))
  }
}
