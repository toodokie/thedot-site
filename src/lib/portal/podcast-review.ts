import type { ReviewAsset } from './review-assets'

type CopyBlock = { key: string | null }

export type ReviewReadiness = {
  ready: boolean
  missing: string[]
}

function hasBlock(blocks: CopyBlock[], keys: string[]): boolean {
  return blocks.some((block) => block.key !== null && keys.includes(block.key))
}

// Same match as the database package check (0073): key, channel and kind must all agree.
// Matching on the key alone showed Approve for a pack the database then refused.
function packAsset(
  assets: ReviewAsset[],
  key: string,
  channel: ReviewAsset['channel'],
  kind: ReviewAsset['asset_kind'],
): ReviewAsset | null {
  return assets.find((asset) => asset.asset_key === key && asset.channel === channel && asset.asset_kind === kind) ?? null
}

// Rule of 2026-10-06 (Anastasia): a Kanset Talks episode is four pieces, so a format 'podcast'
// piece is the YouTube episode alone. The Instagram and Facebook parts (caption, reel cover,
// captioned teaser) are required only when the piece itself lists Instagram or Facebook, which
// keeps older combined pieces honest. Same test as the database (0100): platform names are
// compared trimmed and lower-cased.
export function podcastCarriesSocial(platforms: readonly string[] | null | undefined): boolean {
  return (platforms ?? []).some((platform) => ['instagram', 'facebook'].includes(platform.trim().toLowerCase()))
}

export function reviewPackageReadiness(
  format: string | null,
  blocks: CopyBlock[],
  assets: ReviewAsset[],
  hasLegacyDesign: boolean,
  platforms: readonly string[] | null,
): ReviewReadiness {
  const missing: string[] = []

  if (format === 'podcast') {
    const social = podcastCarriesSocial(platforms)
    if (social && !hasBlock(blocks, ['social-caption', 'ig-facebook-caption'])) {
      missing.push('Instagram and Facebook caption')
    }
    if (!hasBlock(blocks, ['youtube-title'])) missing.push('YouTube title')
    if (!hasBlock(blocks, ['youtube-description'])) missing.push('YouTube description')
    if (!hasBlock(blocks, ['youtube-tags'])) missing.push('YouTube tags')

    if (social) {
      if (!packAsset(assets, 'social-cover', 'social', 'cover')) missing.push('Instagram and Facebook reel cover')
      const teaser = packAsset(assets, 'social-teaser', 'social', 'video')
      if (!teaser) missing.push('Instagram and Facebook teaser video')
      else if (teaser.caption_status !== 'burned_in_verified') {
        missing.push('verified burned-in captions on the teaser')
      }
    }
    if (!packAsset(assets, 'youtube-cover', 'youtube', 'cover')) missing.push('YouTube horizontal cover')
  } else if (format === 'podcast_article') {
    if (!hasBlock(blocks, ['article-body'])) missing.push('website article')
    if (!packAsset(assets, 'website-cover', 'website', 'cover')) missing.push('website cover')
  } else if (!hasLegacyDesign && assets.length === 0) {
    missing.push('linked design')
  }

  return { ready: missing.length === 0, missing }
}

export function contentReviewPackageReadiness(
  item: {
    format: string | null
    copy_blocks: CopyBlock[]
    platforms: readonly string[] | null
    canva_url: string | null
    drive_url: string | null
  },
  assets: ReviewAsset[],
): ReviewReadiness {
  return reviewPackageReadiness(
    item.format,
    item.copy_blocks,
    assets,
    Boolean(item.canva_url || item.drive_url),
    item.platforms,
  )
}
