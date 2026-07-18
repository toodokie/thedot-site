'use client'
import { useState } from 'react'
import { Heading, Text, Button } from '@thedot/design-system'
import styles from './strategy.module.css'

// One recommendation, read-only, with a copy-to-clipboard button. Reuses the CopyBlock approach:
// navigator.clipboard.writeText with a short-lived "Copied" confirmation. Copies the full
// recommendation (title + body) so it lands somewhere useful, not a bare fragment.
export default function RecommendationCard({
  categoryLabel,
  platformLabel,
  title,
  body,
}: {
  categoryLabel: string
  platformLabel?: string | null
  title: string
  body: string
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${title}\n\n${body}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked; no-op
    }
  }
  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <div className={styles.chips}>
          <span className={styles.chip}>{categoryLabel}</span>
          {platformLabel ? <span className={styles.chip}>{platformLabel}</span> : null}
        </div>
        <Button as="button" variant="ghost" size="sm" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <Heading level={4} className={styles.title}>{title}</Heading>
      <div className={styles.body}><Text size="md" tone="black">{body}</Text></div>
    </article>
  )
}
