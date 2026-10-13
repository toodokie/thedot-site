import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import styles from './Button.module.css';

type ButtonOwnProps = {
  variant?: 'black' | 'yellow' | 'ghost';
  size?: 'md' | 'sm';
  className?: string;
  children: ReactNode;
};

export type ButtonProps<E extends ElementType = 'button'> = ButtonOwnProps & {
  as?: E;
} & Omit<ComponentPropsWithoutRef<E>, keyof ButtonOwnProps | 'as'>;

export function Button<E extends ElementType = 'button'>(props: ButtonProps<E>) {
  const { variant = 'black', size = 'md', className, children, as, ...rest } = props;
  const Comp = (as ?? 'button') as ElementType;
  const cls = [styles.button, styles[variant], styles[size], className].filter(Boolean).join(' ');
  return (
    <Comp className={cls} {...rest}>
      {children}
    </Comp>
  );
}
