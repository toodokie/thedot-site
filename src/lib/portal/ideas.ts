import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export type IdeaRow = {
  id: string
  author_type: string
  author_name: string
  title: string
  body: string | null
  status: string
  created_at: string
  updated_at: string
}

const SELECT = 'id, author_type, author_name, title, body, status, created_at, updated_at'

// Reads the idea board for one client. `authenticated` has column SELECT and RLS scopes reads to the
// caller's own client, but we also filter by client_id explicitly (defence in depth). Newest first.
// Any query error is surfaced as PortalDataError, never swallowed into an empty board (that would
// hide the client's own ideas from them).
export async function getIdeas(clientId: string): Promise<IdeaRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_ideas')
    .select(SELECT)
    .eq('client_id', clientId)
    .neq('status', 'archived') // archive is a soft remove; the client board never shows archived rows
    .order('created_at', { ascending: false })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as IdeaRow[]
}
