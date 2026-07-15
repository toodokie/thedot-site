import type { ReactNode } from 'react';
import styles from './Card.module.css';

export interface CardProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Card({ eyebrow, title, className, children }: CardProps) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(' ')}>
      {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}
      {title && <h4 className={styles.title}>{title}</h4>}
      {children && <div className={styles.body}>{children}</div>}
    </div>
  );
}
