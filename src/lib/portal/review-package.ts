export type ReviewCopyBlock = {
  key: string | null
  label: string
  body: string
}

export type ReviewGroup = {
  id: 'social' | 'linkedin' | 'youtube' | 'website' | 'creative' | 'copy'
  title: string
  description: string
  blocks: ReviewCopyBlock[]
}

const SOCIAL_KEYS = new Set([
  'social-caption',
  'ig-facebook-caption',
  'ig-caption',
  'fb-caption',
  'instagram-caption',
  'facebook-caption',
  'hashtags',
])

function normalized(value: string | null): string {
  return (value ?? '').trim().toLowerCase()
}

function isYoutube(block: ReviewCopyBlock): boolean {
  const key = normalized(block.key)
  const label = normalized(block.label)
  return key.includes('youtube') || label.includes('youtube')
}

function isLinkedIn(block: ReviewCopyBlock): boolean {
  const key = normalized(block.key)
  const label = normalized(block.label)
  return key.includes('linkedin') || label.includes('linkedin')
}

function isWebsite(block: ReviewCopyBlock): boolean {
  const key = normalized(block.key)
  const label = normalized(block.label)
  return key.includes('article') || key.includes('website')
    || label.includes('article') || label.includes('website')
}

function isCreative(block: ReviewCopyBlock): boolean {
  const key = normalized(block.key)
  const label = normalized(block.label)
  return ['graphic', 'carousel', 'slides', 'slide', 'storyboard', 'creative'].some((term) =>
    key.includes(term) || label.includes(term))
}

function isSocial(block: ReviewCopyBlock, platforms: string[]): boolean {
  const key = normalized(block.key)
  const label = normalized(block.label)
  if (key && SOCIAL_KEYS.has(key)) return true
  if (label.includes('instagram') || label.includes('facebook')) return true
  // A plain "Caption" is social copy unless this is a YouTube-only piece. This keeps
  // older canonical packs readable without forcing a data migration.
  return (key === 'caption' || label === 'caption')
    && platforms.some((platform) => ['instagram', 'facebook', 'ig', 'fb'].includes(normalized(platform)))
}

function socialDescription(blocks: ReviewCopyBlock[]): string {
  const keys = new Set(blocks.map((block) => normalized(block.key)))
  const hasSeparateVariants = (keys.has('ig-caption') || keys.has('instagram-caption'))
    && (keys.has('fb-caption') || keys.has('facebook-caption'))
  return hasSeparateVariants
    ? 'Instagram and Facebook have prepared variations. Both are part of this one review decision.'
    : 'One shared social caption for Instagram and Facebook. Hashtags, if included, are part of the same package.'
}

/**
 * Group exact immutable copy blocks into a human review order. This is presentation
 * only: no block is merged, rewritten, or omitted, and the existing version-wide
 * decision remains the approval boundary.
 */
export function groupReviewCopy(
  blocks: ReviewCopyBlock[],
  platforms: string[],
): ReviewGroup[] {
  const social: ReviewCopyBlock[] = []
  const linkedin: ReviewCopyBlock[] = []
  const youtube: ReviewCopyBlock[] = []
  const website: ReviewCopyBlock[] = []
  const creative: ReviewCopyBlock[] = []
  const other: ReviewCopyBlock[] = []

  for (const block of blocks) {
    if (isYoutube(block)) youtube.push(block)
    else if (isLinkedIn(block)) linkedin.push(block)
    else if (isWebsite(block)) website.push(block)
    else if (isSocial(block, platforms)) social.push(block)
    else if (isCreative(block)) creative.push(block)
    else other.push(block)
  }

  return [
    social.length > 0 && {
      id: 'social' as const,
      title: 'Social caption',
      description: socialDescription(social),
      blocks: social,
    },
    linkedin.length > 0 && {
      id: 'linkedin' as const,
      title: 'LinkedIn post',
      description: 'This LinkedIn adaptation is reviewed and scheduled as its own piece.',
      blocks: linkedin,
    },
    youtube.length > 0 && {
      id: 'youtube' as const,
      title: 'YouTube package',
      description: 'Review the title, description, tags, and any chapters prepared for YouTube. Each labelled block can be edited separately.',
      blocks: youtube,
    },
    website.length > 0 && {
      id: 'website' as const,
      title: 'Website article',
      description: 'The article and its publishing details belong to the separate website piece and its own approval.',
      blocks: website,
    },
    creative.length > 0 && {
      id: 'creative' as const,
      title: 'Creative and on-asset copy',
      description: 'This text appears in the graphic, carousel, or video treatment. Review it with the linked design below.',
      blocks: creative,
    },
    other.length > 0 && {
      id: 'copy' as const,
      title: 'Additional copy',
      description: 'This material is included in the same review package.',
      blocks: other,
    },
  ].filter((group): group is ReviewGroup => Boolean(group))
}
