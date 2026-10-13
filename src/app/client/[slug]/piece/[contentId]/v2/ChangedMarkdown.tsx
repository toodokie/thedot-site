import MarkdownCopy from '@/components/portal/MarkdownCopy'
import { changedParagraphs, splitParagraphs } from '@/lib/portal/piece-page/changed-passages'
import styles from './piece-page.module.css'

const INHERIT = { fontSize: 'inherit', lineHeight: 'inherit' } as const

// Markdown rendered as text (never as asterisks), with the paragraphs that changed since the
// previous version lightly highlighted (spec 4.3). before=null means nothing to compare.
export default function ChangedMarkdown({ body, before, className }: { body: string; before: string | null; className?: string }) {
  const chunks = splitParagraphs(body)
  const flags = changedParagraphs(before, body)
  return <div className={className ?? styles.copy}>
    {chunks.map((chunk, index) => flags[index]
      ? <div key={index} className={styles.changed} data-changed="true">
        <span className={styles.srOnly}>Updated: </span>
        <MarkdownCopy body={chunk} style={INHERIT} />
      </div>
      : <MarkdownCopy key={index} body={chunk} style={INHERIT} />)}
  </div>
}
