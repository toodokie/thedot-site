// Which seats see the redesigned piece page (spec 2026-10-03, plan 4a decision 2).
// PORTAL_PIECE_PAGE_V2: empty or 'off' = nobody, 'all' = every seat, otherwise a comma list of
// seat emails. Read on the server only. The value is not a secret.
export function usesPiecePageV2(
  email: string | null | undefined,
  setting: string | undefined = process.env.PORTAL_PIECE_PAGE_V2,
): boolean {
  const value = (setting ?? '').trim().toLowerCase()
  if (!value || value === 'off') return false
  if (value === 'all') return true
  const seat = (email ?? '').trim().toLowerCase()
  if (!seat) return false
  return value.split(',').map((entry) => entry.trim()).filter(Boolean).includes(seat)
}
