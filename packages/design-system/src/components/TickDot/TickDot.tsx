import styles from './TickDot.module.css';

export interface TickDotProps {
  checked: boolean;
  /** Accessible name. Omit when adjacent text already says the state (the dot is then aria-hidden). */
  label?: string;
  className?: string;
}

export function TickDot({ checked, label, className }: TickDotProps) {
  const cls = [styles.tick, checked ? styles.checked : null, className].filter(Boolean).join(' ');
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  return <span className={cls} data-checked={checked ? 'true' : 'false'} {...a11y} />;
}
