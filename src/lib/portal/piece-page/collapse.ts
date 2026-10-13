// Collapsing header (spec 2026-10-03 section 10a): the slim bar appears past 120 px of scroll and
// hides again under 40 px. The gap stops it flickering around one threshold.
export const COLLAPSE_AT = 120
export const EXPAND_BELOW = 40

export function nextCollapsed(current: boolean, scrollY: number): boolean {
  if (!current && scrollY > COLLAPSE_AT) return true
  if (current && scrollY < EXPAND_BELOW) return false
  return current
}
