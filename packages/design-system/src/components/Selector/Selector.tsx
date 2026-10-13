import type { ReactNode } from 'react';
import styles from './Selector.module.css';

export interface SelectorProps {
  selected?: boolean;
  onSelect?: () => void;
  size?: number;
  className?: string;
  children: ReactNode;
}

export function Selector({ selected = false, onSelect, size = 120, className, children }: SelectorProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{ width: size, height: size }}
      className={[styles.selector, selected && styles.selected, className].filter(Boolean).join(' ')}
    >
      {children}
    </button>
  );
}
