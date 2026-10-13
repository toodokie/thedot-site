'use client'

import { useEffect, useId, useState } from 'react'
import type DocumentEditor from './DocumentEditor'
import styles from './document-editor.module.css'

// ProseMirror (about 65 KB gzipped) loads only when an editor is on screen, so the review page
// that shares this route never downloads it. Until it arrives she gets a plain text box with the
// same label and the same save path; once she has typed there, that box stays for this editor,
// so a late load can never reset her text or her cursor.

type Editor = typeof DocumentEditor
type Props = Parameters<Editor>[0]

let loaded: Editor | null = null
let pending: Promise<Editor> | null = null

export function loadDocumentEditor(): Promise<Editor> {
  if (loaded) return Promise.resolve(loaded)
  pending ??= import('./DocumentEditor').then((module) => {
    loaded = module.default
    return module.default
  }).catch((error: unknown) => {
    pending = null
    throw error
  })
  return pending
}

// Test-only: hands over an already imported editor so tests render it synchronously.
export function provideDocumentEditor(editor: Editor): void {
  loaded = editor
}

export default function LazyDocumentEditor(props: Props) {
  const [Loaded, setLoaded] = useState<Editor | null>(() => loaded)
  const [typed, setTyped] = useState<string | null>(null)

  useEffect(() => {
    if (Loaded) return
    let live = true
    loadDocumentEditor().then((editor) => { if (live) setLoaded(() => editor) }).catch(() => { /* stays plain */ })
    return () => { live = false }
  }, [Loaded])

  if (Loaded && typed === null) return <Loaded {...props} />
  return <PlainWhileLoading {...props} text={typed ?? props.value}
    onType={(next) => { setTyped(next); props.onChange(next) }} />
}

function PlainWhileLoading({ label, text, onType, onBlur, describedBy, autoFocus = false }: Props & {
  text: string
  onType: (next: string) => void
}) {
  const id = useId()
  return <div className={styles.wrap}>
    <label htmlFor={id} className={styles.label}>{label}</label>
    <textarea id={id} className={styles.surface} value={text} autoFocus={autoFocus} spellCheck
      aria-describedby={describedBy}
      onChange={(event) => onType(event.target.value)}
      onBlur={() => onBlur?.()} />
  </div>
}
