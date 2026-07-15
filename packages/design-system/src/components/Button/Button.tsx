import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import styles from './Button.module.css';

type Common = { variant?: 'black' | 'yellow' | 'ghost'; size?: 'md' | 'sm'; className?: string; children: ReactNode };
export type ButtonProps =
  | (Common & { as?: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  | (Common & { as: 'a' } & AnchorHTMLAttributes<HTMLAnchorElement>);

export function Button(props: ButtonProps) {
  const { variant = 'black', size = 'md', className, children, as = 'button', ...rest } = props as Common & { as?: 'button' | 'a' };
  const cls = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
  if (as === 'a') return <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>;
  return <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>;
}
