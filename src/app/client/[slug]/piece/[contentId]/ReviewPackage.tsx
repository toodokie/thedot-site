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
  isPublished,
  finalDecisionAvailable,
}: {
  blocks: ReviewCopyBlock[]
  platforms: string[]
  slug: string
  contentId: string
  canRequest: boolean
  isPublished: boolean
  finalDecisionAvailable: boolean
}) {
  const groups = groupReviewCopy(blocks, platforms)

  return (
    <section id="review-copy" aria-labelledby="review-package-heading" style={panel}>
      <Eyebrow tone="grey">{finalDecisionAvailable ? 'Review package' : 'Copy review'}</Eyebrow>
      <div id="review-package-heading" style={{ marginTop: 8 }}>
        <Heading level={3}>{finalDecisionAvailable ? 'One decision, all materials' : 'Copy ready, design in progress'}</Heading>
      </div>
      <Text tone="graphite">
        {isPublished
          ? 'This version is already live. Its published copy cannot be changed here. Use the comments below to ask The Dot about a correction or follow-up.'
          : finalDecisionAvailable
            ? 'Your approval covers this version\'s copy and linked design together. You can comment on exact wording, suggest a replacement, or request a change to the package.'
            : 'This fact-checked copy is ready for your feedback. Please leave comments or suggested edits below. We will return with the linked design for the separate final package decision.'}
      </Text>

      <div style={{ marginTop: 24 }}>
        {groups.length === 0 ? <Text tone="grey">No copy for this piece yet.</Text> : groups.map((group) => (
          <section key={group.id} aria-labelledby={`review-group-${group.id}`} style={{ marginTop: 24 }}>
            <div id={`review-group-${group.id}`}><Heading level={4}>{group.title}</Heading></div>
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
