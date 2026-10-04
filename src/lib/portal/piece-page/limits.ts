// Per-block edit limit (migration 0088): the send refuses more; the editor never truncates.
export const MAX_EDIT_CHARS = 50_000
// The length counter appears from here (spec 2026-10-03 section 5).
export const COUNTER_FROM_CHARS = 45_000
