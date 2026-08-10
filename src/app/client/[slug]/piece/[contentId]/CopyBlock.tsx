'use client'
import { useState } from 'react'
import { Button } from '@thedot/design-system'
import SuggestEditForm from './SuggestEditForm'
import MarkdownCopy, { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'

// A labeled, copy-to-clipboard block of per-surface copy (IG/FB caption, YT title, etc.).
export default function CopyBlock({ blockKey, label, body, slug, contentId, canRequest, idempotencyKey }: {
  blockKey: string | null; label: string; body: string; slug?: string; contentId?: string
  canRequest?: boolean; idempotencyKey?: string
}) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainTextFromMarkdown(body))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard blocked; no-op
    }
  }
  return (
    <div data-copy-block-key={blockKey ?? undefined} style={{ border: '1px solid var(--dot-hairline)', background: 'var(--dot-cream)', padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--dot-font-display)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--dot-graphite)' }}>{label}</span>
        <Button as="button" variant="ghost" size="sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <MarkdownCopy body={body} />
      {canRequest && blockKey && slug && contentId && idempotencyKey && <div style={{ marginTop: 10 }}>
        <SuggestEditForm slug={slug} contentId={contentId} blockKey={blockKey} initialKey={idempotencyKey} />
      </div>}
    </div>
  )
}
