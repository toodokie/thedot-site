import 'server-only'
import { createSupabaseServer } from '@/lib/supabase/server'

// Plan 4b review fix 3: sent markers show only the edits the viewing seat sent. The page's request
// read (the drawer's Past edits) has every seat's requests and no sender column, so the seat's
// own request ids come from its review bundles (migration 0081: requested_by and request_ids are
// readable by the client's seats under RLS). Fails closed: a failed read gives no ids, so the page
// shows no sent markers rather than everyone's, and never fails.

export type BundleReader = { from: (table: 'content_edit_review_bundles') => unknown }
type BundleQuery = {
  select: (columns: string) => BundleQuery
  eq: (column: string, value: unknown) => BundleQuery
} & PromiseLike<{ data: unknown; error: { message: string } | null }>

export async function seatRequestIdsFrom(db: BundleReader, where: {
  clientId: string
  contentItemId: string
  userId: string | null
}): Promise<string[]> {
  if (!where.userId) return []
  try {
    const query = (db.from('content_edit_review_bundles') as BundleQuery).select('request_ids')
      .eq('client_id', where.clientId).eq('content_id', where.contentItemId).eq('requested_by', where.userId)
    const { data, error } = await query
    if (error || !Array.isArray(data)) {
      console.error('seat request ids unavailable:', error?.message ?? 'no data')
      return []
    }
    const ids: string[] = []
    for (const row of data as Array<{ request_ids?: unknown }>) {
      if (!Array.isArray(row.request_ids)) return []
      for (const id of row.request_ids) if (typeof id === 'string') ids.push(id)
    }
    return ids
  } catch (error) {
    console.error('seat request ids unavailable:', error instanceof Error ? error.message : String(error))
    return []
  }
}

// The signed-in seat's own sent request ids, read with its own session.
export async function getMySeatRequestIds(clientId: string, contentItemId: string, userId: string): Promise<string[]> {
  try {
    return await seatRequestIdsFrom(await createSupabaseServer() as unknown as BundleReader, { clientId, contentItemId, userId })
  } catch {
    return []
  }
}
