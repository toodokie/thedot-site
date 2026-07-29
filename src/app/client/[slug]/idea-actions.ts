'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

export type IdeaCommentActionState = { error?: string; success?: string }

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

// Ideas are shared discussion objects before they become pieces. The RPC, not this form, binds
// the submitted idea to the caller's tenant and capability. This action only validates the
// browser payload and refreshes the one shared board after a committed write.
export async function addIdeaComment(
  _previous: IdeaCommentActionState,
  formData: FormData,
): Promise<IdeaCommentActionState> {
  const slug = textField(formData, 'slug')
  const ideaId = textField(formData, 'ideaId')
  const body = (textField(formData, 'body') ?? '').trim()
  const idempotencyKey = textField(formData, 'idempotencyKey')
  if (!slug || !ideaId || !idempotencyKey
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(ideaId)
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(idempotencyKey)) {
    return { error: 'This form expired. Please reload and try again.' }
  }
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canComment) return { error: 'Your account cannot comment on ideas.' }
  if (!body || body.length > 4000) return { error: 'Write a comment of no more than 4,000 characters.' }

  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.rpc('add_idea_comment', {
    p_idea_id: ideaId,
    p_body: body,
    p_idempotency_key: idempotencyKey,
  })
  if (error) return { error: 'Could not send your comment. Please reload and try again.' }
  const outcome = data && typeof data === 'object' && 'outcome' in data
    ? String((data as { outcome?: unknown }).outcome ?? '') : ''
  if (outcome && outcome !== 'created') return { error: 'Could not send your comment. Please try again.' }
  revalidatePath(`/client/${slug}`)
  revalidatePath(`/client/${slug}/ideas`)
  return { success: 'Comment sent to The Dot.' }
}
