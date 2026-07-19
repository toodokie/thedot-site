'use server'
import { after } from 'next/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'
import { notifyDecision } from '@/lib/portal/notify'

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
  // Mirror the RPC's transition matrix for fast feedback; the RPC is the authoritative boundary.
  if (decision === 'approved' && item.status !== 'draft') return { error: 'This piece is not open for approval.' }
  if (decision === 'change_requested' && item.status === 'idea') return { error: 'This piece is not open for review.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_decision', {
    p_content_id: item.id, p_content_version: item.version, p_decision: decision, p_note: note || null,
  })
  if (error) return { error: 'Could not save your decision. Please try again.' }

  // Notify The Dot AFTER the response is sent, so a slow SMTP server never stalls the decision.
  after(() => notifyDecision({
    actorName: session.name ?? session.email,
    decision,
    title: item.title,
    note: note || null,
    slug,
    contentId,
  }))

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
