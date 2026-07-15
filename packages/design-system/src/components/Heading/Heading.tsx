import type { ElementType, ReactNode } from 'react';
import styles from './Heading.module.css';

export interface HeadingProps {
  level?: 1 | 2 | 3 | 4;
  variant?: 'display' | 'section';
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

const tagFor = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' } as const;

export function Heading({ level = 1, variant, as, className, children }: HeadingProps) {
  const Tag = (as ?? tagFor[level]) as ElementType;
  const cls = [styles.heading, styles[`l${level}`], variant && styles[variant], className]
    .filter(Boolean).join(' ');
  return <Tag className={cls}>{children}</Tag>;
}
