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
  if (!item.canva_url && !item.drive_url) {
    return { error: 'The final package is not ready yet. You can leave copy feedback now; final approval opens once a linked design is ready.' }
  }
  // Mirror the RPC's transition matrix for fast feedback; the RPC is the authoritative boundary.
  if (decision === 'approved' && item.status !== 'draft') return { error: 'This piece is not open for approval.' }
  if (decision === 'change_requested' && item.status === 'idea') return { error: 'This piece is not open for review.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_decision', {
    p_content_id: item.id, p_content_version: item.version, p_decision: decision, p_note: note || null,
  })
  if (error) return { error: 'Could not save your decision. Please try again.' }

  // Alerts (email to The Dot + in-app) are enqueued transactionally by the 0015 notification trigger
  // on the activity_log row this RPC writes, then delivered by the notification consumer. No inline send.

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
