import styles from './CalendarLegend.module.css'

// One legend, shared by the client calendar and the agency calendar, so the two views cannot
// drift apart on what a colour means. The client asked for this after two of the three accents
// were indistinguishable on her calendar.
export const CALENDAR_LEGEND: Array<{
  accent: 'with_dot' | 'awaiting_review' | 'committed' | 'published'
  label: string
}> = [
  { accent: 'with_dot', label: 'With The Dot' },
  { accent: 'awaiting_review', label: 'Awaiting your review' },
  { accent: 'committed', label: 'Approved or scheduled' },
  { accent: 'published', label: 'Published' },
]

export default function CalendarLegend() {
  return (
    <div className={styles.legend}>
      {CALENDAR_LEGEND.map((entry) => (
        <span key={entry.accent} className={styles.legendItem}>
          <span className={`${styles.swatch} ${styles[`swatch_${entry.accent}`]}`} />
          {entry.label}
        </span>
      ))}
    </div>
  )
}
