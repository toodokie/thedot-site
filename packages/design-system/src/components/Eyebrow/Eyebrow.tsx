import type { ReactNode } from 'react';
import styles from './Eyebrow.module.css';

export interface EyebrowProps {
  tone?: 'grey' | 'black';
  className?: string;
  children: ReactNode;
}

export function Eyebrow({ tone = 'grey', className, children }: EyebrowProps) {
  const cls = [styles.eyebrow, styles[tone], className].filter(Boolean).join(' ');
  return <span className={cls}>{children}</span>;
}
