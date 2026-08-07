import type { ReviewAsset } from './review-assets'

type CopyBlock = { key: string | null }

export type ReviewReadiness = {
  ready: boolean
  missing: string[]
}

function hasBlock(blocks: CopyBlock[], keys: string[]): boolean {
  return blocks.some((block) => block.key !== null && keys.includes(block.key))
}

function assetByKey(assets: ReviewAsset[], key: string): ReviewAsset | null {
  return assets.find((asset) => asset.asset_key === key) ?? null
}

export function reviewPackageReadiness(
  format: string | null,
  blocks: CopyBlock[],
  assets: ReviewAsset[],
  hasLegacyDesign: boolean,
): ReviewReadiness {
  const missing: string[] = []

  if (format === 'podcast') {
    if (!hasBlock(blocks, ['social-caption', 'ig-facebook-caption'])) {
      missing.push('Instagram and Facebook caption')
    }
    if (!hasBlock(blocks, ['youtube-title'])) missing.push('YouTube title')
    if (!hasBlock(blocks, ['youtube-description'])) missing.push('YouTube description')
    if (!hasBlock(blocks, ['youtube-tags'])) missing.push('YouTube tags')

    if (!assetByKey(assets, 'social-cover')) missing.push('Instagram and Facebook reel cover')
    const teaser = assetByKey(assets, 'social-teaser')
    if (!teaser) missing.push('Instagram and Facebook teaser video')
    else if (teaser.caption_status !== 'burned_in_verified') {
      missing.push('verified burned-in captions on the teaser')
    }
    if (!assetByKey(assets, 'youtube-cover')) missing.push('YouTube horizontal cover')
  } else if (format === 'podcast_article') {
    if (!hasBlock(blocks, ['article-body'])) missing.push('website article')
    if (!assetByKey(assets, 'website-cover')) missing.push('website cover')
  } else if (!hasLegacyDesign && assets.length === 0) {
    missing.push('linked design')
  }

  return { ready: missing.length === 0, missing }
}
