'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

// Strict: a missing field or a File is null, not the strings "null" / "[object File]".
function textField(data: FormData, key: string): string | null {
  const v = data.get(key)
  return typeof v === 'string' ? v : null
}

export async function addIdea(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const title = (textField(formData, 'title') ?? '').trim()
  const body = (textField(formData, 'body') ?? '').trim()

  if (!slug) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canSubmitRequests) return { error: 'You do not have permission to submit ideas.' }

  if (!title) return { error: 'Please add a short title for your idea.' }
  if (title.length > 300) return { error: 'That title is too long (300 characters max).' }
  if (body.length > 4000) return { error: 'That idea is too long (4000 characters max).' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('add_idea', {
    p_client_id: session.clientId,
    p_title: title,
    p_body: body || null,
  })
  if (error) return { error: 'Could not save your idea. Please try again.' }

  // Re-render the board in place (no redirect; the new idea appears at the top).
  revalidatePath(`/client/${slug}/ideas`)
  return {}
}

export async function editIdea(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const ideaId = textField(formData, 'ideaId')
  const title = (textField(formData, 'title') ?? '').trim()
  const body = (textField(formData, 'body') ?? '').trim()

  if (!slug || !ideaId) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canSubmitRequests) return { error: 'You do not have permission to edit ideas.' }

  if (!title) return { error: 'Please add a short title for your idea.' }
  if (title.length > 300) return { error: 'That title is too long (300 characters max).' }
  if (body.length > 4000) return { error: 'That idea is too long (4000 characters max).' }

  const supabase = await createSupabaseServer()
  // edit_idea (security definer) re-checks that the caller is a member of the idea's client, so a
  // forged idea id from another client is rejected server-side. We never trust the id here.
  const { error } = await supabase.rpc('edit_idea', {
    p_idea_id: ideaId,
    p_title: title,
    p_body: body || null,
  })
  if (error) return { error: 'Could not save your changes. Please try again.' }

  revalidatePath(`/client/${slug}/ideas`)
  return {}
}
