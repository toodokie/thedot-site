// Review asset options (migration 0098). Assets on one version that share an option group are
// alternatives Maria picks between in the piece page (a reel cover in teal or rust, a YouTube test
// cover in rust or teal); the option label is the short name on her choice. Fixed parts of a set
// carry no group. Browser-safe: portal-write and the piece page both import from here.

export const OPTION_GROUP_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
export const OPTION_LABEL_MAX = 80

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error('optionGroup and optionLabel must be strings')
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

// The extra set_content_review_asset arguments for a portal-write review-asset payload. Empty for a
// fixed asset, so the call is the pre-0098 one.
export function reviewAssetOptionArgs(payload: Record<string, unknown>):
  { p_option_group?: string; p_option_label?: string } {
  const group = text(payload.optionGroup)
  const label = text(payload.optionLabel)
  if ((group === null) !== (label === null)) throw new Error('optionGroup and optionLabel are set together')
  if (group === null || label === null) return {}
  if (!OPTION_GROUP_PATTERN.test(group)) throw new Error('optionGroup must be a lowercase key (a-z, 0-9, - or _)')
  if (label.length > OPTION_LABEL_MAX || /[\u0000-\u001f\u007f]/.test(label)) {
    throw new Error(`optionLabel must be one line of at most ${OPTION_LABEL_MAX} characters`)
  }
  return { p_option_group: group, p_option_label: label }
}

export type OptionPick = { option_group: string; asset_key: string }
export type OptionChoice = {
  group: string
  options: Array<{ assetKey: string; label: string; optionLabel: string }>
  chosen: { assetKey: string; label: string; optionLabel: string } | null
}

// Each option group on a version, its options in key order and the seat's pick (null until she
// picks). A pick whose asset is no longer an option of that group counts as no pick.
export function optionChoices(
  assets: Array<{ asset_key: string; label: string; option_group?: string | null; option_label?: string | null }>,
  picks: OptionPick[],
): OptionChoice[] {
  const groups = new Map<string, OptionChoice['options']>()
  for (const asset of assets) {
    if (!asset.option_group || !asset.option_label) continue
    groups.set(asset.option_group, [...(groups.get(asset.option_group) ?? []),
      { assetKey: asset.asset_key, label: asset.label, optionLabel: asset.option_label }])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([group, options]) => {
    const sorted = [...options].sort((x, y) => x.assetKey.localeCompare(y.assetKey))
    const pick = picks.find((p) => p.option_group === group)
    return { group, options: sorted, chosen: sorted.find((o) => o.assetKey === pick?.asset_key) ?? null }
  })
}

// A pick is stored against the version it was made on, but a later version that carries the same
// options (a copy-only revision, an applied edit) keeps it. Given picks from the current version and
// earlier ones, the newest version's pick wins per group, then the latest picked_at. optionChoices
// still drops a pick whose asset is no longer an option of that group.
export function carriedOptionPicks<T extends OptionPick & { content_version: number; picked_at?: string | null }>(
  rows: T[],
  currentVersion: number,
): T[] {
  const latest = new Map<string, T>()
  for (const row of rows) {
    if (row.content_version > currentVersion) continue
    const held = latest.get(row.option_group)
    if (!held || row.content_version > held.content_version
      || (row.content_version === held.content_version && (row.picked_at ?? '') > (held.picked_at ?? ''))) {
      latest.set(row.option_group, row)
    }
  }
  return [...latest.values()]
}
