import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

// The current viewer's last-seen timestamp for a client (null on their first ever visit). Used to
// mark activity that arrived since the last visit as "new". RLS scopes portal_seen to the caller,
// so this only ever returns the viewer's own row.
export async function getLastSeen(clientId: string): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('portal_seen')
    .select('last_seen_at')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) throw new PortalDataError(error.message)
  return (data?.last_seen_at as string | undefined) ?? null
}
