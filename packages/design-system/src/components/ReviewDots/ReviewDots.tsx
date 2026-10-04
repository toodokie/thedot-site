import styles from './ReviewDots.module.css';

export interface ReviewDotsProps {
  /** Number of dots. Non-finite or negative values render none. */
  total: number;
  /** How many dots, from the left, are filled. Clamped to 0..total. */
  filled: number;
  size?: 'md' | 'sm';
  /** Accessible name for the whole row. Omit when visible text beside it says the same. */
  label?: string;
  className?: string;
}

function whole(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export function ReviewDots({ total, filled, size = 'md', label, className }: ReviewDotsProps) {
  const count = whole(total);
  const on = Math.min(count, whole(filled));
  const cls = [styles.row, styles[size], className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <span className={cls} data-size={size} {...a11y}>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={[styles.dot, i < on ? styles.on : null].filter(Boolean).join(' ')}
          data-filled={i < on ? 'true' : 'false'}
        />
      ))}
    </span>
  );
}
