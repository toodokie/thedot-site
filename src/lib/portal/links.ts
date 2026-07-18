import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'

// A single Library link (no file hosting; just a labelled external URL, per the PII rule).
export type LinkRow = {
  id: string
  client_id: string
  category: 'brand' | 'video'
  label: string
  url: string
  description: string | null
  sort: number
  created_at: string
}

const SELECT = 'id, client_id, category, label, url, description, sort, created_at'

// All of a client's Library links, brand first then video, each section in sort order
// (matches the links_by_client index: client_id, category, sort). Throws PortalDataError on failure.
export async function getLinks(clientId: string): Promise<LinkRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('links')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('category', { ascending: true })
    .order('sort', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as LinkRow[]
}
