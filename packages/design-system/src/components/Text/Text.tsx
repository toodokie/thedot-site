import type { ElementType, ReactNode } from 'react';
import styles from './Text.module.css';

export interface TextProps {
  size?: 'lg' | 'md' | 'sm';
  tone?: 'black' | 'grey' | 'graphite';
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export function Text({ size = 'md', tone = 'black', as, className, children }: TextProps) {
  const Tag = (as ?? 'p') as ElementType;
  const cls = [styles.text, styles[size], styles[tone], className].filter(Boolean).join(' ');
  return <Tag className={cls}>{children}</Tag>;
}
