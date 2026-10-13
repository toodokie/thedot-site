import { Button, Eyebrow, Text } from '@thedot/design-system'
import MarkdownCopy from '@/components/portal/MarkdownCopy'
import styles from './agency-panel.module.css'

const COPY_STYLE = { fontSize: 16, lineHeight: 1.55, maxWidth: '65ch' } as const

// The working version's copy and design links (the old page's "Content" card, unchanged in substance).
export default function WorkingCopy({ heading, blocks, clientBody, canva, drive }: {
  heading: string
  blocks: Array<{ key: string | null; label: string; body: string }>
  clientBody: string | null
  canva: string | null
  drive: string | null
}) {
  return (
    <section className={styles.card}>
      <Eyebrow tone="grey">{heading}</Eyebrow>
      <div style={{ marginTop: 'var(--dot-space-4)' }}>
        {blocks.length > 0 ? blocks.map((block, index) => (
          <div key={block.key ?? `block-${index}`} className={styles.block}>
            {block.label && <div className={styles.blockLabel}>{block.label}</div>}
            <MarkdownCopy body={block.body} style={COPY_STYLE} />
          </div>
        )) : clientBody ? <MarkdownCopy body={clientBody} style={COPY_STYLE} />
          : <Text tone="grey">No copy synced for this version yet.</Text>}
      </div>
      {(canva || drive) && <div className={styles.actions}>
        {canva && <Button as="a" href={canva} target="_blank" rel="noreferrer" variant="yellow" size="sm">Open design in Canva</Button>}
        {drive && <Button as="a" href={drive} target="_blank" rel="noreferrer" variant="ghost" size="sm">Open in Drive</Button>}
      </div>}
    </section>
  )
}
