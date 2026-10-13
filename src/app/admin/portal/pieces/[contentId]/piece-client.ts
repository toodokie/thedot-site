import type { createSupabaseAdmin } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createSupabaseAdmin>

export type PieceClient =
  | { kind: 'found'; clientId: string; slug: string }
  | { kind: 'ambiguous'; clients: Array<{ slug: string; name: string }> }
  | { kind: 'missing' }

// The admin piece page serves every client. content_id is unique per client (0002), so the piece's
// own client is found from content_id; an optional hint (the ?client= slug or id) settles a
// content_id two clients share. Ambiguity is reported, never guessed.
export async function resolvePieceClient(admin: Admin, contentId: string, hint?: string | null): Promise<PieceClient> {
  const items = await admin.from('content_items').select('client_id').eq('content_id', contentId)
  if (items.error) throw new Error(`Piece client lookup failed: ${items.error.message}`)
  const ids = [...new Set(((items.data ?? []) as Array<{ client_id: string }>).map((row) => row.client_id))]
  if (ids.length === 0) return { kind: 'missing' }
  const clients = await admin.from('clients').select('id, slug, name').in('id', ids)
  if (clients.error) throw new Error(`Piece client lookup failed: ${clients.error.message}`)
  let rows = (clients.data ?? []) as Array<{ id: string; slug: string; name: string }>
  if (hint) rows = rows.filter((row) => row.slug === hint || row.id === hint)
  if (rows.length === 0) return { kind: 'missing' }
  if (rows.length === 1) return { kind: 'found', clientId: rows[0].id, slug: rows[0].slug }
  return {
    kind: 'ambiguous',
    clients: rows.map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug)),
  }
}

export type PreviewSeatRow = {
  client_id?: string; email?: string; name?: string; auth_user_id?: string; can_decide?: boolean
  can_comment?: boolean; can_submit_requests?: boolean; can_manage_schedule?: boolean
}

// The live seat the read-only preview loads: Maria's for Kanset, otherwise the client's deciding seat.
export function pickPreviewSeat<T extends PreviewSeatRow>(rows: T[], clientId: string, preferredEmail = 'maria@kanset.com'): T | undefined {
  const own = rows.filter((row) => row.client_id === clientId)
  return own.find((row) => row.email === preferredEmail)
    ?? own.filter((row) => row.can_decide).sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))[0]
}
