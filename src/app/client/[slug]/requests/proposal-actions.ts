'use server'

import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getClientProposal } from '@/lib/portal/proposals'

export type ProposalActionState = { error?: string; success?: string }

function proposalInput(formData: FormData) {
  const slug = formData.get('slug'); const proposalKey = formData.get('proposalKey')
  const idempotencyKey = formData.get('idempotencyKey')
  if (typeof slug !== 'string' || typeof proposalKey !== 'string' || typeof idempotencyKey !== 'string'
    || !slug || !proposalKey || !idempotencyKey) throw new Error('Invalid proposal request')
  return { slug, proposalKey, idempotencyKey }
}
function refresh(slug: string, key: string) {
  revalidatePath(`/client/${slug}`)
  revalidatePath(`/client/${slug}/requests`)
  revalidatePath(`/client/${slug}/requests/proposals/${key}`)
}

export async function decideProposal(_: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  try {
    const { slug, proposalKey, idempotencyKey } = proposalInput(formData)
    const decision = formData.get('decision'); const note = formData.get('note')
    if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Choose approve or request changes.' }
    if (typeof note !== 'string' || note.trim().length > 4000 || (decision === 'change_requested' && !note.trim()))
      return { error: decision === 'change_requested' ? 'Please say what you would like changed.' : 'Your note is too long.' }
    const session = await getClientSession(slug)
    if (!session || !session.canDecide) return { error: 'This account cannot make the final decision.' }
    const proposal = await getClientProposal(session.clientId, proposalKey)
    if (!proposal || proposal.status !== 'awaiting_decision') return { error: 'This proposal is no longer awaiting a decision.' }
    const supabase = await createSupabaseServer()
    const { error } = await supabase.rpc('record_client_proposal_decision', {
      p_proposal_id: proposal.id, p_revision: proposal.revision, p_decision: decision,
      p_note: note.trim() || null, p_idempotency_key: idempotencyKey,
    })
    if (error) return { error: 'We could not record that decision. Please try again.' }
    refresh(slug, proposalKey)
    return { success: decision === 'approved' ? 'Approved. The Dot has been notified.' : 'Change request sent to The Dot.' }
  } catch { return { error: 'We could not record that decision. Please try again.' } }
}

export async function replyToProposal(_: ProposalActionState, formData: FormData): Promise<ProposalActionState> {
  try {
    const { slug, proposalKey, idempotencyKey } = proposalInput(formData)
    const body = formData.get('body')
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 4000) return { error: 'Write a reply of up to 4,000 characters.' }
    const session = await getClientSession(slug)
    if (!session || !session.canSubmitRequests) return { error: 'This account cannot send a reply.' }
    const proposal = await getClientProposal(session.clientId, proposalKey)
    if (!proposal) return { error: 'This proposal is no longer available.' }
    const supabase = await createSupabaseServer()
    const { data, error } = await supabase.rpc('reply_to_client_proposal_as_client', {
      p_proposal_id: proposal.id, p_body: body.trim(), p_idempotency_key: idempotencyKey,
    })
    if (error) return { error: 'We could not send that reply. Please try again.' }
    if ((data as { outcome?: string } | null)?.outcome === 'rate_limited') {
      return { error: 'Too many replies were sent. Please try again in an hour.' }
    }
    refresh(slug, proposalKey)
    return { success: 'Reply sent to The Dot.' }
  } catch { return { error: 'We could not send that reply. Please try again.' } }
}
