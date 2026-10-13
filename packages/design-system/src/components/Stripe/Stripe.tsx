import styles from './Stripe.module.css';

export interface StripeProps { tone?: 'black' | 'grey'; height?: number; className?: string }

export function Stripe({ tone = 'black', height = 22, className }: StripeProps) {
  return <div aria-hidden className={[styles.stripe, styles[tone], className].filter(Boolean).join(' ')} style={{ height }} />;
}
