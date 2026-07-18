import type { CSSProperties } from 'react';
import styles from './Logo.module.css';
import { logoDataUri } from './logo-data';

export interface LogoProps {
  /** Rendered height in px; width scales to the wordmark's aspect ratio. */
  height?: number;
  className?: string;
  alt?: string;
}

/** The Dot Creative wordmark. Self-contained (inlined), renders anywhere. */
export function Logo({ height = 40, className, alt = 'The Dot Creative' }: LogoProps) {
  const style: CSSProperties = { height, width: 'auto', display: 'block' };
  return (
    <img
      src={logoDataUri}
      alt={alt}
      style={style}
      className={[styles.logo, className].filter(Boolean).join(' ')}
    />
  );
}
