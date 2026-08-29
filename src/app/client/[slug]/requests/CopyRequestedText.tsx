'use client'

import { useState } from 'react'
import { Button } from '@thedot/design-system'

export default function CopyRequestedText({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
      setTimeout(() => setState('idle'), 1500)
    } catch {
      setState('failed')
      setTimeout(() => setState('idle'), 2500)
    }
  }

  const action = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'
  return <Button as="button" type="button" variant="ghost" size="sm"
    aria-label={`${action} ${label}`} onClick={copy}>{action}</Button>
}
