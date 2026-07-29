import type { CSSProperties } from 'react'
import { randomUUID } from 'node:crypto'
import { Eyebrow, Heading, Text } from '@thedot/design-system'
import { groupReviewCopy, type ReviewCopyBlock } from '@/lib/portal/review-package'
import CopyBlock from './CopyBlock'

const panel: CSSProperties = {
  border: '1px solid var(--dot-hairline)',
  background: 'var(--dot-off-white)',
  padding: '20px',
  marginBottom: 28,
}

export default function ReviewPackage({
  blocks,
  platforms,
  slug,
  contentId,
  canRequest,
}: {
  blocks: ReviewCopyBlock[]
  platforms: string[]
  slug: string
  contentId: string
  canRequest: boolean
}) {
  const groups = groupReviewCopy(blocks, platforms)

  return (
    <section id="review-copy" aria-labelledby="review-package-heading" style={panel}>
      <Eyebrow tone="grey">Review package</Eyebrow>
      <div id="review-package-heading" style={{ marginTop: 8 }}>
        <Heading level={3}>One decision, all materials</Heading>
      </div>
      <Text tone="graphite">
        Your approval covers this version&apos;s copy and linked design together. You can comment on exact wording,
        suggest a replacement, or request a change to the package.
      </Text>

      <div style={{ marginTop: 24 }}>
        {groups.length === 0 ? <Text tone="grey">No copy for this piece yet.</Text> : groups.map((group) => (
          <section key={group.id} aria-labelledby={`review-group-${group.id}`} style={{ marginTop: 24 }}>
            <Heading level={4} id={`review-group-${group.id}`}>{group.title}</Heading>
            <Text size="sm" tone="grey">{group.description}</Text>
            <div style={{ marginTop: 12 }}>
              {group.blocks.map((block, index) => (
                <CopyBlock
                  key={block.key ?? `${block.label}-${index}`}
                  blockKey={block.key}
                  label={block.label}
                  body={block.body}
                  slug={slug}
                  contentId={contentId}
                  canRequest={canRequest}
                  idempotencyKey={randomUUID()}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
