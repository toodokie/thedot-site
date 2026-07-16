'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'

export async function decide(formData: FormData): Promise<{ error?: string }> {
  const slug = String(formData.get('slug'))
  const contentId = String(formData.get('contentId'))
  const decision = String(formData.get('decision'))
  const note = String(formData.get('note') || '').trim()

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Invalid action.' }
  if (decision === 'change_requested' && !note) return { error: 'Please add a note describing the change.' }

  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_decision', {
    p_content_id: item.id, p_content_version: item.version, p_decision: decision, p_note: note || null,
  })
  if (error) return { error: 'Could not save your decision. Please try again.' }

  revalidatePath(`/client/${slug}`)
  redirect(`/client/${slug}`)
}
