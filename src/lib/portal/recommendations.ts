import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export type RecommendationCategory = 'content' | 'platform' | 'growth' | 'copy'

export type RecommendationRow = {
  id: string
  title: string
  body: string
  category: RecommendationCategory
  platform: string | null
  created_at: string
}

const SELECT = 'id, title, body, category, platform, created_at'

// Reads the recommendations The Dot has authored for this client, newest first. Read-only to the
// client (RLS scopes reads to the caller's own client); we also filter by client_id explicitly
// (defence in depth). Any query error surfaces as PortalDataError, never swallowed into an empty
// list (that would silently hide the client's own strategy from them).
export async function getRecommendations(clientId: string): Promise<RecommendationRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('recommendations')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as RecommendationRow[]
}
