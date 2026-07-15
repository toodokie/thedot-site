import styles from './Dot.module.css';

export interface DotProps { fill?: 'silver' | 'black' | 'yellow'; size?: number; className?: string }

export function Dot({ fill = 'silver', size = 48, className }: DotProps) {
  return <span aria-hidden className={[styles.dot, styles[fill], className].filter(Boolean).join(' ')} style={{ width: size, height: size }} />;
}
