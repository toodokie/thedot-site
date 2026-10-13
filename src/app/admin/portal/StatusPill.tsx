import styles from './portal-admin.module.css'

// One shared, semantic status pill (spec: SVG/word, never color-only). Presentational and
// hook-free, so both the server component (GatesAdmin) and the client component
// (PublicationAdmin) import it. Every tone pairs a color with a WORD, and the confirmed/
// verified tones also carry a check glyph, so meaning never rests on color alone.
export type PillTone =
  | 'done' | 'open' | 'na' | 'muted' | 'info'
  | 'pending' | 'scheduled' | 'live' | 'verified' | 'failed' | 'nudge'

const TONE_CLASS: Record<PillTone, string> = {
  done: styles.pillDone,
  open: styles.pillOpen,
  na: styles.pillNa,
  muted: styles.pillMuted,
  info: styles.pillInfo,
  pending: styles.pillPending,
  scheduled: styles.pillScheduled,
  live: styles.pillLive,
  verified: styles.pillVerified,
  failed: styles.pillFailed,
  nudge: styles.nudge,
}

// tones that read as "confirmed / positive" get a check glyph as a second, non-color cue
const CHECK_TONES = new Set<PillTone>(['done', 'live', 'verified'])

function Check() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 6.4 L4.8 8.7 L9.5 3.3" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function StatusPill({ tone, label }: { tone: PillTone; label: string }) {
  return (
    <span className={`${styles.pill} ${TONE_CLASS[tone]}`}>
      {CHECK_TONES.has(tone) && <Check />}
      {label}
    </span>
  )
}
