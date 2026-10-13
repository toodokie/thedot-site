import type { InputHTMLAttributes } from 'react';
import styles from './Input.module.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  invalid?: boolean;
}

export function Input({ label, invalid, id, className, ...rest }: InputProps) {
  return (
    <span className={styles.field}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <input
        id={id}
        className={[styles.input, invalid && styles.invalid, className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </span>
  );
}
