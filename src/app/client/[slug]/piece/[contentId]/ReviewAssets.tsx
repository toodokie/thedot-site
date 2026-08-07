import type { CSSProperties } from 'react'
import { Button, Eyebrow, Heading, Text } from '@thedot/design-system'
import type { ReviewAsset } from '@/lib/portal/review-assets'

const panel: CSSProperties = {
  marginBottom: 28,
  padding: 20,
  border: '1px solid var(--dot-hairline)',
  background: 'var(--dot-cream)',
}

const assetCard: CSSProperties = {
  padding: '16px 0',
  borderTop: '1px solid var(--dot-hairline)',
}

const CHANNEL_LABEL: Record<ReviewAsset['channel'], string> = {
  social: 'Instagram and Facebook',
  youtube: 'YouTube',
  website: 'Website',
}

function captionLabel(asset: ReviewAsset): string | null {
  if (asset.caption_status === 'burned_in_verified') return 'Burned-in captions verified'
  if (asset.caption_status === 'burned_in_pending') return 'Burned-in captions need proofing'
  return null
}

export default function ReviewAssets({ assets }: { assets: ReviewAsset[] }) {
  const channels = (['social', 'youtube', 'website'] as const)
    .map((channel) => ({ channel, assets: assets.filter((asset) => asset.channel === channel) }))
    .filter((group) => group.assets.length > 0)

  return (
    <section id="review-assets" aria-labelledby="review-assets-heading" style={panel}>
      <Eyebrow tone="grey">Asset review</Eyebrow>
      <div id="review-assets-heading" style={{ marginTop: 8 }}>
        <Heading level={3}>Covers and video</Heading>
      </div>
      <Text tone="graphite">
        Open each current asset below. You can leave feedback on one exact asset, and your package decision covers all of them together with the copy.
      </Text>

      <div style={{ marginTop: 20 }}>
        {channels.map((group) => (
          <section key={group.channel} aria-labelledby={`asset-channel-${group.channel}`} style={{ marginTop: 20 }}>
            <div id={`asset-channel-${group.channel}`}>
              <Heading level={4}>{CHANNEL_LABEL[group.channel]}</Heading>
            </div>
            {group.assets.map((asset) => {
              const captions = captionLabel(asset)
              return (
                <div key={asset.id} style={assetCard}>
                  <Text as="div"><strong>{asset.label}</strong></Text>
                  <Text as="div" size="sm" tone="grey">
                    {asset.width_px} × {asset.height_px}px
                    {captions ? ` · ${captions}` : ''}
                  </Text>
                  {asset.review_note && <Text as="div" size="sm" tone="graphite">{asset.review_note}</Text>}
                  <div style={{ marginTop: 10 }}>
                    <Button as="a" href={asset.url} target="_blank" rel="noreferrer" variant="yellow" size="sm">
                      Open {asset.label}
                    </Button>
                  </div>
                </div>
              )
            })}
          </section>
        ))}
      </div>
    </section>
  )
}
