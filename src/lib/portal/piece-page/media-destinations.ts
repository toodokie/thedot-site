// Media by destination (piece page, 2026-10-06). A podcast package carries different media per
// destination and size: YouTube test covers at 1280x720, a reel cover in two colours, an Instagram
// trailer (LINK IN BIO) and a Facebook trailer (LINK IN COMMENTS). The page shows them grouped by
// where they post, each at its own size. Pure and browser-safe.
//
// How a review asset's destination is derived, in order (channel and key only):
//   1. a key containing "linkedin"                                  -> LinkedIn
//   2. channel "youtube", or a key starting "youtube"                -> YouTube
//   3. channel "website"                                             -> Website
//   4. channel "social":
//      a. a key ending in -fb or -facebook (or with that segment)    -> Facebook
//      b. a key ending in -ig or -instagram (or with that segment)   -> Instagram
//      c. a key whose "<key>-fb" or "<key>-facebook" sibling exists  -> Instagram (the sibling is
//         Facebook's variant, e.g. social-teaser and social-teaser-fb)
//      d. otherwise shared: Instagram and Facebook when the piece posts to both or names neither;
//         the one of them it posts to; LinkedIn for a LinkedIn-only piece
//   5. anything else                                                 -> Other files (never hidden)

export type DestinationKey = 'youtube' | 'instagram-facebook' | 'instagram' | 'facebook' | 'linkedin' | 'website' | 'other'

export const DESTINATION_LABELS: Record<DestinationKey, string> = {
  youtube: 'YouTube',
  'instagram-facebook': 'Instagram and Facebook',
  instagram: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  website: 'Website',
  other: 'Other files',
}

const ORDER: DestinationKey[] = ['youtube', 'instagram-facebook', 'instagram', 'facebook', 'linkedin', 'website', 'other']
const KIND_ORDER: Record<string, number> = { video: 0, cover: 1, document: 2 }

type AssetLike = { asset_key: string; channel: string; asset_kind: string; option_group?: string | null }

const FACEBOOK_KEY = /(^|-)(fb|facebook)(-|$)/
const INSTAGRAM_KEY = /(^|-)(ig|instagram)(-|$)/

export function assetDestination(asset: AssetLike, platforms: string[], siblingKeys: ReadonlySet<string>): DestinationKey {
  const key = asset.asset_key.toLowerCase()
  if (key.includes('linkedin')) return 'linkedin'
  if (asset.channel === 'youtube' || key.startsWith('youtube')) return 'youtube'
  if (asset.channel === 'website') return 'website'
  if (asset.channel !== 'social') return 'other'
  if (FACEBOOK_KEY.test(key)) return 'facebook'
  if (INSTAGRAM_KEY.test(key)) return 'instagram'
  if (siblingKeys.has(`${key}-fb`) || siblingKeys.has(`${key}-facebook`)) return 'instagram'
  const where = new Set(platforms.map((p) => p.toLowerCase()))
  const ig = where.has('instagram')
  const fb = where.has('facebook')
  if (ig && !fb) return 'instagram'
  if (fb && !ig) return 'facebook'
  if (!ig && !fb && where.has('linkedin')) return 'linkedin'
  return 'instagram-facebook'
}

export type DestinationGroup<T> = { key: DestinationKey; label: string; assets: T[] }

export function groupMediaByDestination<T extends AssetLike>(assets: T[], platforms: string[]): Array<DestinationGroup<T>> {
  const keys = new Set(assets.map((asset) => asset.asset_key.toLowerCase()))
  const byKey = new Map<DestinationKey, T[]>()
  for (const asset of assets) {
    const key = assetDestination(asset, platforms, keys)
    byKey.set(key, [...(byKey.get(key) ?? []), asset])
  }
  return ORDER.filter((key) => byKey.has(key)).map((key) => ({
    key,
    label: DESTINATION_LABELS[key],
    assets: [...byKey.get(key)!].sort((x, y) => (KIND_ORDER[x.asset_kind] ?? 9) - (KIND_ORDER[y.asset_kind] ?? 9)
      || x.asset_key.localeCompare(y.asset_key)),
  }))
}

// The grouped view is for packages: two or more videos, two or more covers, or any option to pick.
// A simple reel (one video, at most one cover) keeps the single-video layout.
export function usesDestinationGroups(assets: AssetLike[]): boolean {
  const videos = assets.filter((asset) => asset.asset_kind === 'video').length
  const covers = assets.filter((asset) => asset.asset_kind === 'cover').length
  return videos > 1 || covers > 1 || assets.some((asset) => Boolean(asset.option_group))
}
