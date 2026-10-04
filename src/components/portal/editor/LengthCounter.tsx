import { COUNTER_FROM_CHARS, MAX_EDIT_CHARS, characterCount } from '@/lib/portal/piece-page/limits'
import styles from './document-editor.module.css'

const format = (value: number) => value.toLocaleString('en-CA')

// Spec 5: a counter only from about 45,000; the editor never truncates. The count is announced
// politely; going over the limit is an alert, because Send turns off.
export default function LengthCounter({ text }: { text: string }) {
  const count = characterCount(text)
  if (count < COUNTER_FROM_CHARS) return null
  if (count > MAX_EDIT_CHARS) {
    const over = count - MAX_EDIT_CHARS
    return <span className={styles.over} role="alert">
      {format(over)} {over === 1 ? 'character' : 'characters'} over the {format(MAX_EDIT_CHARS)} limit. Shorten it before you send. Nothing has been cut.
    </span>
  }
  return <span className={styles.count} aria-live="polite">{format(count)} of {format(MAX_EDIT_CHARS)} characters</span>
}
