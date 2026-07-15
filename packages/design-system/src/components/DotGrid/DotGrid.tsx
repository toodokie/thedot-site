import { Dot } from '../Dot/Dot';
import styles from './DotGrid.module.css';

export interface DotGridProps { cols?: number; rows?: number; gap?: number; dotSize?: number; className?: string }

// Deterministic scatter: index-based, no randomness (stable renders for /design-sync screenshots).
function fillFor(i: number): 'silver' | 'black' | 'yellow' {
  if (i % 7 === 2) return 'yellow';
  if (i % 3 === 0) return 'black';
  return 'silver';
}

export function DotGrid({ cols = 8, rows = 6, gap = 16, dotSize = 44, className }: DotGridProps) {
  const total = cols * rows;
  return (
    <div
      className={[styles.grid, className].filter(Boolean).join(' ')}
      style={{ gridTemplateColumns: `repeat(${cols}, ${dotSize}px)`, gap }}
    >
      {Array.from({ length: total }, (_, i) => <Dot key={i} fill={fillFor(i)} size={dotSize} />)}
    </div>
  );
}
