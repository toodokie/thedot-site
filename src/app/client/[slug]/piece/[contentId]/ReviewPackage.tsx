import type { CSSProperties } from 'react'
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
  canRequest,
  isPublished,
  finalDecisionAvailable,
}: {
  blocks: ReviewCopyBlock[]
  platforms: string[]
  canRequest: boolean
  isPublished: boolean
  finalDecisionAvailable: boolean
}) {
  const groups = groupReviewCopy(blocks, platforms)

  return (
    <section id="review-copy" aria-labelledby="review-package-heading" style={panel}>
      <Eyebrow tone="grey">{finalDecisionAvailable ? 'Review package' : 'Copy review'}</Eyebrow>
      <div id="review-package-heading" style={{ marginTop: 8 }}>
        <Heading level={3}>{finalDecisionAvailable ? 'Review each block, then finish once' : 'Copy ready, design in progress'}</Heading>
      </div>
      <Text tone="graphite">
        {isPublished
          ? 'This version is already live. Its published copy cannot be changed here. Use the comments below to ask The Dot about a correction or follow-up.'
          : finalDecisionAvailable
            ? 'Read the copy and visuals in order. Edit anything that should change. At the bottom, you will see one clear next step.'
            : 'This copy is ready for review. Edit any block that should change. We will add the visuals before final approval opens.'}
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
                  canRequest={canRequest}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  )
}
