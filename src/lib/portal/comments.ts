import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export type CommentRow = {
  id: string
  author_type: string
  author_name: string
  body: string
  quoted_text: string | null
  resolved: boolean
  created_at: string
}

const SELECT = 'id, author_type, author_name, body, quoted_text, resolved, created_at'

// Reads the comment thread for one piece. `authenticated` has column SELECT and RLS scopes reads to
// the caller's own client, but we also filter by client_id explicitly (defence in depth). Any query
// error is surfaced as PortalDataError, never swallowed into an empty thread (that would hide the
// client's own words from them).
export async function getComments(clientId: string, contentUuid: string): Promise<CommentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('comments')
    .select(SELECT)
    .eq('content_id', contentUuid)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as CommentRow[]
}
