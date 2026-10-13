'use server'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

// Marks the current visit: upserts the viewer's last_seen to now via the touch_seen RPC. Called
// client-side on mount (not during server render / prefetch), and deliberately does NOT revalidate,
// so the "new" markers computed from the PREVIOUS last_seen stay visible for the rest of this visit
// and only clear on the next one. Best-effort: a failure just means markers persist a bit longer.
export async function markSeen(slug: string): Promise<void> {
  const session = await getClientSession(slug)
  if (!session) return
  const supabase = await createSupabaseServer()
  await supabase.rpc('touch_seen', { p_client_id: session.clientId })
}
