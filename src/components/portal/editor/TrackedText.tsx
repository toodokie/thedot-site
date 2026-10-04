import { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'
import { diffWords } from '@/lib/portal/piece-page/text-diff'
import styles from './document-editor.module.css'

// Review before sending (spec 5): her unsent text against the released text, words only.
export default function TrackedText({ base, current }: { base: string; current: string }) {
  const ops = diffWords(plainTextFromMarkdown(base), plainTextFromMarkdown(current))
  return <div className={styles.tracked}>
    {ops.map((op, index) => op.op === 'equal'
      ? <span key={index}>{op.text}</span>
      : op.op === 'insert'
        ? <ins key={index} className={styles.ins}><span className={styles.srOnly}>added: </span>{op.text}</ins>
        : <del key={index} className={styles.del}><span className={styles.srOnly}>removed: </span>{op.text}</del>)}
  </div>
}
