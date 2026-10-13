// Test fixtures shaped from the three real Kanset Talks ep4 pieces Anastasia reviewed on 2026-10-06
// (production rows read-only the same day: asset keys, channels, kinds, sizes, labels, preview keys,
// preview sizes and frame labels). Drive ids and signed URLs are placeholders.
import type { ReviewAsset } from '@/lib/portal/review-assets'
import type { SignedReviewPreview } from '@/lib/portal/review-preview-core'

function asset(version: number, asset_key: string, channel: ReviewAsset['channel'], asset_kind: ReviewAsset['asset_kind'],
  label: string, width_px: number, height_px: number, option: [string, string] | null = null): ReviewAsset {
  return {
    id: `${asset_key}-v${version}`, content_version: version, asset_key, label, channel, asset_kind,
    url: `https://drive.google.com/open?id=${asset_key}`, width_px, height_px,
    caption_status: asset_kind === 'video' ? 'burned_in_verified' : 'not_applicable', review_note: null,
    option_group: option?.[0] ?? null, option_label: option?.[1] ?? null,
  }
}

function preview(version: number, id: string, previewKey: string, reviewAssetKey: string, width: number, height: number,
  durationSeconds: number, frameLabels: string[]): SignedReviewPreview {
  return {
    id, contentItemId: `item-${id}`, contentVersion: version, previewKey, reviewAssetKey, mediaKind: 'video', width, height,
    durationSeconds, videoUrl: `https://signed.example/${id}.mp4`, posterUrl: `https://signed.example/${id}-poster.jpg`,
    frames: frameLabels.map((label, i) => ({ label, url: `https://signed.example/${id}-f${i + 1}.jpg` })),
    expiresAt: '2999-01-01T00:00:00.000Z',
  }
}

const TRAILER_FRAMES = ['Opening: settlement in Canada', 'Captions', 'What comes after immigrating?', 'What happens after?',
  'End card, Instagram: LINK IN BIO']

// Case 1: kanset-2026-10-podcast-ep4 v2 (format podcast). The horizontal "cut" preview's four frames
// are the four 16:9 YouTube test covers.
export const EP4_V2 = {
  platforms: ['youtube', 'instagram', 'facebook'],
  assets: [
    asset(2, 'social-cover', 'social', 'cover', 'Reel cover, option A: teal', 1080, 1920, ['social-cover', 'Teal']),
    asset(2, 'social-cover-rust', 'social', 'cover', 'Reel cover, option B: rust', 1080, 1920, ['social-cover', 'Rust']),
    asset(2, 'social-teaser', 'social', 'video', 'Instagram trailer, 24 seconds', 1080, 1920),
    asset(2, 'social-teaser-fb', 'social', 'video', 'Facebook trailer, 24 seconds', 1080, 1920),
    asset(2, 'youtube-cover', 'youtube', 'cover', 'Test cover 1: your usual style', 1280, 720),
    asset(2, 'youtube-cover-test-2', 'youtube', 'cover', 'Test cover 2: both of you up close', 1280, 720),
    asset(2, 'youtube-cover-test-3-rust', 'youtube', 'cover', 'Test cover 3, option A: rust', 1280, 720, ['youtube-test-3', 'Rust']),
    asset(2, 'youtube-cover-test-3-teal', 'youtube', 'cover', 'Test cover 3, option B: teal', 1280, 720, ['youtube-test-3', 'Teal']),
  ],
  previews: [
    preview(2, 'ep4-cut', 'cut', 'youtube-cover', 1280, 720, 60.03, ['YouTube test cover 1: your usual style',
      'YouTube test cover 2: both of you up close', 'YouTube test cover 3, option A: rust', 'YouTube test cover 3, option B: teal']),
    preview(2, 'ep4-trailer', 'trailer', 'social-teaser', 1080, 1920, 23.6, TRAILER_FRAMES),
  ],
}

// Case 2: kanset-2026-10-linkedin-podcast-ep4 v1 (format linkedin-post): a 4:5 video.
export const LINKEDIN_EP4 = {
  platforms: ['linkedin'],
  assets: [
    asset(1, 'linkedin-cover', 'social', 'cover', 'LinkedIn video cover', 1080, 1350),
    asset(1, 'linkedin-video', 'social', 'video', 'LinkedIn video, 75 seconds', 1080, 1350),
  ],
  previews: [preview(1, 'li-reel', 'reel', 'linkedin-video', 1080, 1350, 75.18,
    ['Card: IN THIS EPISODE', 'Card: ALSO IN THIS EPISODE', 'End card', 'Captions (Mary)'])],
}

// Case 3: kanset-2026-10-podcast-ep4-trailer v1 (format reel): two reel-cover options.
export const EP4_TRAILER = {
  platforms: ['instagram', 'facebook'],
  assets: [
    asset(1, 'social-cover', 'social', 'cover', 'Reel cover, option A: teal', 1080, 1920, ['social-cover', 'Teal']),
    asset(1, 'social-cover-rust', 'social', 'cover', 'Reel cover, option B: rust', 1080, 1920, ['social-cover', 'Rust']),
    asset(1, 'social-teaser', 'social', 'video', 'Instagram trailer, 24 seconds', 1080, 1920),
    asset(1, 'social-teaser-fb', 'social', 'video', 'Facebook trailer, 24 seconds', 1080, 1920),
  ],
  previews: [preview(1, 'trailer-reel', 'reel', 'social-teaser', 1080, 1920, 23.6, TRAILER_FRAMES)],
}
