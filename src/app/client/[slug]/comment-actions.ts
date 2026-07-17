'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getContentItem } from '@/lib/portal/data'
import { notifyComment } from '@/lib/portal/notify'

// Strict: a missing field or a File is null, not the strings "null" / "[object File]".
function textField(data: FormData, key: string): string | null {
  const v = data.get(key)
  return typeof v === 'string' ? v : null
}

export async function addComment(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const contentId = textField(formData, 'contentId')
  const body = (textField(formData, 'body') ?? '').trim()
  const quotedText = (textField(formData, 'quotedText') ?? '').trim()

  if (!slug || !contentId) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  if (!body) return { error: 'Please write a comment before sending.' }
  if (body.length > 4000) return { error: 'That comment is too long (4000 characters max).' }

  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('add_comment', {
    p_content_id: item.id,
    p_body: body,
    p_quoted_text: quotedText || null,
  })
  if (error) return { error: 'Could not post your comment. Please try again.' }

  // Notify The Dot that the client commented (best-effort; never blocks the comment).
  await notifyComment({
    actorName: session.name ?? session.email,
    title: item.title,
    body,
    quotedText: quotedText || null,
    slug,
    contentId,
  })

  // Re-render the piece page in place (no redirect; the thread reappears with the new comment).
  revalidatePath(`/client/${slug}/piece/${contentId}`)
  return {}
}
