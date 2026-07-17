import type { ReactNode } from 'react';
import styles from './ReadMore.module.css';

export interface ReadMoreProps {
  className?: string;
  children?: ReactNode;
}

/** "Read Full Article"-style underlined cue that slides right on hover.
 *  Matches the site's .read-more-btn. Put it inside a Card body; it sits at
 *  the bottom (margin-top: auto) and reacts to the Card's hover too. */
export function ReadMore({ className, children = 'Read Full Article' }: ReadMoreProps) {
  return <span className={[styles.readMore, className].filter(Boolean).join(' ')}>{children}</span>;
}
