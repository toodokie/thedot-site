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

export async function addComment(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const contentId = textField(formData, 'contentId')
  const body = (textField(formData, 'body') ?? '').trim()
  const quotedText = (textField(formData, 'quotedText') ?? '').trim()
  const copyBlockKey = (textField(formData, 'copyBlockKey') ?? '').trim()
  const targetKind = (textField(formData, 'targetKind') ?? 'copy').trim()
  const designUrl = (textField(formData, 'designUrl') ?? '').trim()

  if (!slug || !contentId) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canComment) return { error: 'You do not have permission to add comments.' }
  if (targetKind !== 'copy' && targetKind !== 'design') return { error: 'Please choose what this comment refers to.' }

  if (!body) return { error: 'Please write a comment before sending.' }
  if (body.length > 4000) return { error: 'That comment is too long (4000 characters max).' }
  if (quotedText.length > 2000) return { error: 'The selected quote is too long (2000 characters max).' }
  if (targetKind === 'design' && (quotedText || copyBlockKey)) return { error: 'Please choose either copy feedback or design feedback.' }
  if (quotedText && !copyBlockKey) return { error: 'Please select the text again before commenting.' }
  if (!quotedText && copyBlockKey) return { error: 'Please select the text again before commenting.' }

  const item = await getContentItem(session.clientId, contentId)
  if (!item) return { error: 'That piece is no longer available.' }

  const supabase = await createSupabaseServer()
  const result = targetKind === 'design'
    ? await supabase.rpc('add_design_comment', {
      p_content_id: item.id,
      p_body: body,
      p_design_url: designUrl || null,
    })
    : await supabase.rpc('add_comment', {
      p_content_id: item.id,
      p_body: body,
      p_quoted_text: quotedText || null,
      p_copy_block_key: copyBlockKey || null,
    })
  const { error } = result
  if (error) return { error: 'Could not post your comment. Please try again.' }

  // Alerts are enqueued transactionally by the 0015 comment trigger on the comment row this RPC
  // writes, then delivered by the notification consumer. No inline send (avoids duplicate alerts).

  // Re-render the piece page in place (no redirect; the thread reappears with the new comment).
  revalidatePath(`/client/${slug}/piece/${contentId}`)
  return {}
}
