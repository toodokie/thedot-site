'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getPlanCycles } from '@/lib/portal/plan-cycle'

// Strict: a missing field or a File is null, not the strings "null" / "[object File]".
function textField(data: FormData, key: string): string | null {
  const v = data.get(key)
  return typeof v === 'string' ? v : null
}

// Client decision on a weekly plan cycle. Mirrors the piece `decide` action: the app-layer checks are
// fast feedback only; `record_plan_cycle_decision` is the authoritative boundary (it re-checks tenant
// membership via auth.uid(), the can_decide capability, the current revision, and the open status,
// and is granted to `authenticated` only — never service_role). We call it with the caller's session.
export async function decidePlanCycle(formData: FormData): Promise<{ error?: string }> {
  const slug = textField(formData, 'slug')
  const cycleId = textField(formData, 'cycleId')
  const revisionRaw = textField(formData, 'revision')
  const decision = textField(formData, 'decision')
  const note = (textField(formData, 'note') ?? '').trim()

  if (!slug || !cycleId || !revisionRaw) return { error: 'Something went wrong. Please reload and try again.' }
  const revision = Number(revisionRaw)
  if (!Number.isInteger(revision) || revision < 1) return { error: 'Something went wrong. Please reload and try again.' }

  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (!session.canDecide) return { error: 'You do not have permission to approve this plan.' }
  if (decision !== 'approved' && decision !== 'change_requested') return { error: 'Invalid action.' }
  if (decision === 'change_requested' && !note) return { error: 'Please add a note describing the changes you would like.' }
  if (note.length > 2000) return { error: 'That note is too long (2000 characters max).' }

  // Fast feedback against the caller's own (RLS-scoped) cycles; the RPC remains authoritative.
  const cycle = (await getPlanCycles(session.clientId)).find((c) => c.id === cycleId)
  if (!cycle) return { error: 'This plan is no longer available. Please reload.' }
  if (cycle.revision !== revision) return { error: 'This plan was updated. Please reload to see the latest version.' }
  if (cycle.status !== 'submitted' && cycle.status !== 'change_requested') {
    return { error: 'This plan is not open for a decision right now. Please reload.' }
  }

  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('record_plan_cycle_decision', {
    p_plan_cycle_id: cycleId, p_revision: revision, p_decision: decision, p_note: note || null,
  })
  if (error) {
    // Map the known RPC boundary errors to a friendly, reload-oriented message; default generic.
    const m = error.message || ''
    if (m.includes('stale plan cycle revision')) return { error: 'This plan was updated. Please reload to see the latest version.' }
    if (m.includes('already decided')) return { error: 'This plan version has already been decided. Please reload.' }
    if (m.includes('not open for decision')) return { error: 'This plan is not open for a decision right now. Please reload.' }
    if (m.includes('not authorized')) return { error: 'You do not have permission to decide on this plan.' }
    if (m.includes('note is required')) return { error: 'Please add a note describing the changes you would like.' }
    return { error: 'Could not save your decision. Please try again.' }
  }

  // Alerts to The Dot are enqueued by the activity_log trigger the RPC writes; no inline send here.
  revalidatePath(`/client/${slug}/plan`)
  redirect(`/client/${slug}/plan`)
}
