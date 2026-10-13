'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { ideaDecisionReturnPath } from '@/lib/portal/idea-decision-route'

function textField(data: FormData, key: string): string | null {
  const value = data.get(key)
  return typeof value === 'string' ? value : null
}

export async function decideIdea(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const contentItemId = textField(formData, 'contentItemId')
  const contentId = textField(formData, 'contentId')
  const planCycleId = textField(formData, 'planCycleId')
  const revisionRaw = textField(formData, 'revision')
  const decision = textField(formData, 'decision')
  const note = (textField(formData, 'note') ?? '').trim()

  if (!slug || !contentItemId || !contentId || !planCycleId || !revisionRaw) {
    return { error: 'Something went wrong. Please reload and try again.' }
  }
  const revision = Number(revisionRaw)
  if (!Number.isInteger(revision) || revision < 1) {
    return { error: 'Something went wrong. Please reload and try again.' }
  }
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canDecide) return { error: 'You do not have permission to decide on ideas.' }
  if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Invalid action.' }
  if (decision === 'change_requested' && !note) return { error: 'Please add a note describing the changes.' }
  if (note.length > 2000) return { error: 'That note is too long (2000 characters max).' }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_content_idea_decision', {
    p_content_item_id: contentItemId,
    p_plan_cycle_id: planCycleId,
    p_plan_cycle_revision: revision,
    p_decision: decision,
    p_note: note || null,
  })
  if (error) {
    const message = error.message || ''
    if (message.includes('stale plan cycle revision')) return { error: 'This plan was updated. Please reload.' }
    if (message.includes('already recorded')) return { error: 'This idea decision is already recorded. Please reload.' }
    if (message.includes('not authorized')) return { error: 'You do not have permission to decide on this idea.' }
    if (message.includes('note')) return { error: 'Please add a note describing the changes.' }
    return { error: 'Could not save your idea decision. Please try again.' }
  }
  revalidatePath(`/client/${slug}/plan`)
  const returnPath = ideaDecisionReturnPath(slug, contentId)
  revalidatePath(returnPath)
  redirect(returnPath)
}
