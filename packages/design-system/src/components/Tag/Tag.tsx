import type { ReactNode } from 'react';
import styles from './Tag.module.css';

export interface TagProps { tone?: 'yellow' | 'black'; className?: string; children: ReactNode }

export function Tag({ tone = 'yellow', className, children }: TagProps) {
  return <span className={[styles.tag, styles[tone], className].filter(Boolean).join(' ')}>{children}</span>;
}
