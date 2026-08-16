'use client'
import { useRef, useState } from 'react'
import { Button } from '@thedot/design-system'
import SuggestEditForm from './SuggestEditForm'
import MarkdownCopy, { plainTextFromMarkdown } from '@/components/portal/MarkdownCopy'

// A labeled, copy-to-clipboard block of per-surface copy (IG/FB caption, YT title, etc.).
export default function CopyBlock({ blockKey, label, body, canRequest }: {
  blockKey: string | null; label: string; body: string; canRequest?: boolean
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [openSignal, setOpenSignal] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainTextFromMarkdown(body))
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 1500)
    } catch {
      setCopyState('failed')
      setTimeout(() => setCopyState('idle'), 2500)
    }
  }
  return (
    <div ref={container} data-copy-block-key={blockKey ?? undefined}
      onMouseUp={() => {
        if (!canRequest || !blockKey) return
        const selection = window.getSelection()
        const text = selection?.toString().trim() ?? ''
        const node = selection?.anchorNode
        if (text && node && container.current?.contains(node)) setSelectedText(text)
      }}
      style={{ border: '1px solid var(--dot-hairline)', background: 'var(--dot-cream)', padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
        <span style={{ fontFamily: 'var(--dot-font-display)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--dot-graphite)' }}>{label}</span>
        <Button as="button" variant="ghost" size="sm" onClick={copy}>
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy'}
        </Button>
      </div>
      <MarkdownCopy body={body} />
      {canRequest && blockKey && selectedText && <div style={{ marginTop: 10 }}>
        <Button as="button" type="button" variant="yellow" size="sm"
          onClick={() => setOpenSignal((value) => value + 1)}>Suggest an edit to this block</Button>
      </div>}
      {canRequest && blockKey && <div style={{ marginTop: 10 }}>
        <SuggestEditForm targetKind="copy_block" targetKey={blockKey} targetLabel={label}
          currentText={body} selectedText={selectedText} openSignal={openSignal} />
      </div>}
    </div>
  )
}
