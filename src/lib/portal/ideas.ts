import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export type IdeaRow = {
  id: string
  author_type: string
  author_name: string
  title: string
  body: string | null
  status: string
  became_content_id: string | null
  created_at: string
  updated_at: string
}

export type IdeaCommentRow = {
  id: string
  client_id: string
  idea_id: string
  reply_to_comment_id: string | null
  author_type: 'client' | 'anastasia' | 'agent'
  author_name: string
  body: string
  resolved: boolean
  created_at: string
}

const SELECT = 'id, author_type, author_name, title, body, status, became_content_id, created_at, updated_at'
const COMMENT_SELECT = 'id, client_id, idea_id, reply_to_comment_id, author_type, author_name, body, resolved, created_at'

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

// One tenant-scoped read for the whole idea inbox avoids an N+1 query for one thread per card.
// RLS still enforces the signed-in member's client membership and a failure remains visible rather
// than being converted to a misleading empty conversation.
export async function getIdeaComments(clientId: string): Promise<IdeaCommentRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('idea_comments')
    .select(COMMENT_SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as IdeaCommentRow[]
}
