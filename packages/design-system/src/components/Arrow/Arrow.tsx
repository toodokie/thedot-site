import styles from './Arrow.module.css';

export interface ArrowProps { direction?: 'up' | 'down' | 'left' | 'right'; size?: number; className?: string }

const rotation = { right: 0, down: 90, left: 180, up: 270 } as const;

export function Arrow({ direction = 'right', size = 48, className }: ArrowProps) {
  return (
    <svg
      className={[styles.arrow, className].filter(Boolean).join(' ')}
      width={size} height={size} viewBox="0 0 24 24" aria-hidden
      style={{ transform: `rotate(${rotation[direction]}deg)` }}
    >
      <path d="M4 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
