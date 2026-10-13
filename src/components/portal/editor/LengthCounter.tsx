import { COUNTER_FROM_CHARS, MAX_EDIT_CHARS, characterCount } from '@/lib/portal/piece-page/limits'
import styles from './document-editor.module.css'

const format = (value: number) => value.toLocaleString('en-CA')

// Spec 5: a counter only from about 45,000; the editor never truncates. The polite live region
// stays mounted from the start (a region inserted late is often not announced) and fills near the
// limit; going over the limit is an alert, because Send turns off.
export default function LengthCounter({ text }: { text: string }) {
  const count = characterCount(text)
  const over = count - MAX_EDIT_CHARS
  return <>
    <span className={styles.count} aria-live="polite">
      {count >= COUNTER_FROM_CHARS && over <= 0 ? `${format(count)} of ${format(MAX_EDIT_CHARS)} characters` : ''}
    </span>
    {over > 0 && <span className={styles.over} role="alert">
      {format(over)} {over === 1 ? 'character' : 'characters'} over the {format(MAX_EDIT_CHARS)} limit. Shorten it before you send. Nothing has been cut.
    </span>}
  </>
}
