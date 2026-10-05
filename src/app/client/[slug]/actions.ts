'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'

// Strict: a missing field or a File is null, not the strings "null" / "[object File]".
function textField(data: FormData, key: string): string | null {
  const v = data.get(key)
  return typeof v === 'string' ? v : null
}

const FINAL_PACKAGE_NOT_READY =
  'The final package is not ready yet. You can leave copy feedback now; final approval opens once a linked design is ready.'

export async function decide(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const contentId = textField(formData, 'contentId')
  const decision = textField(formData, 'decision')
  const note = (textField(formData, 'note') ?? '').trim()

  if (!slug || !contentId) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canDecide) return { error: 'You do not have permission to approve this piece.' }
  if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Invalid action.' }
  if (decision === 'change_requested' && !note) return { error: 'Please add a note describing the change.' }
  if (note.length > 2000) return { error: 'That note is too long (2000 characters max).' }

  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }
  // No app-side package pre-check: the database owns the final-package rule (0073
  // record_content_decision, now portal_core_review_flow_record_content_decision), which also
  // accepts version-bound review assets and content_design_links. A canva/drive-only check here
  // refused every piece whose media is a review asset. Its refusal is mapped below.
  // Mirror the RPC's transition matrix for fast feedback; the RPC is the authoritative boundary.
  if (decision === 'approved' && item.status !== 'draft') return { error: 'This piece is not open for approval.' }
  if (decision === 'change_requested' && item.status === 'idea') return { error: 'This piece is not open for review.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_decision', {
    p_content_id: item.id, p_content_version: item.version, p_decision: decision, p_note: note || null,
  })
  if (error) {
    // 0094: the database refuses an approval while this seat still has unsent drafts.
    if (error.message.includes('unsent_review_drafts')) {
      return { error: 'You have edits that are not sent yet. Send them or discard them, then approve.' }
    }
    // 0073: the database refuses a decision until the final package (design link or review
    // asset, plus the podcast pack keys) is attached to this version.
    if (error.message.includes('final_package_design_required')
      || error.message.includes('final_package_incomplete')) {
      return { error: FINAL_PACKAGE_NOT_READY }
    }
    return { error: 'Could not save your decision. Please try again.' }
  }

  // Alerts (email to The Dot + in-app) are enqueued transactionally by the 0015 notification trigger
  // on the activity_log row this RPC writes, then delivered by the notification consumer. No inline send.

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
