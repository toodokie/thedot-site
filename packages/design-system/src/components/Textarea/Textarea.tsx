import type { TextareaHTMLAttributes } from 'react';
import styles from './Textarea.module.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  invalid?: boolean;
}

export function Textarea({ label, invalid, id, className, ...rest }: TextareaProps) {
  return (
    <span className={styles.field}>
      {label && <label className={styles.label} htmlFor={id}>{label}</label>}
      <textarea
        id={id}
        className={[styles.textarea, invalid && styles.invalid, className].filter(Boolean).join(' ')}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </span>
  );
}
