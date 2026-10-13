// The admin piece page link. content_id is unique per client only, so a link that knows its client
// carries it (slug or id); the page resolves a bare content_id itself when exactly one client has it.
export function adminPieceHref(contentId: string, client?: string | null, sub?: 'maria-preview'): string {
  const path = `/admin/portal/pieces/${encodeURIComponent(contentId)}${sub ? `/${sub}` : ''}`
  return client ? `${path}?client=${encodeURIComponent(client)}` : path
}
