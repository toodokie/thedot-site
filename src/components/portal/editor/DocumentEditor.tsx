'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { baseKeymap } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { enter, insertHardBreak, toggleEm, toggleStrong } from '@/lib/portal/piece-page/editor-commands'
import { isLosslessMarkdown, parseMarkdown, serializeMarkdown } from '@/lib/portal/piece-page/markdown-doc'
import { trackChangesPlugin } from '@/lib/portal/piece-page/track-changes'
import styles from './document-editor.module.css'

// The textbox element of each mounted editor to its view. Used by tests and the phone check only.
export const editorViews = new WeakMap<Element, EditorView>()

// The single authoritative check lives in the codec; Markdown it refuses is edited as plain text.
export { isLosslessMarkdown } from '@/lib/portal/piece-page/markdown-doc'

// Document-like editing (spec 2026-10-03 section 5). value is Markdown; onChange receives Markdown.
// baseText (the released text) turns on track changes; null turns it off. forcePlain (or Markdown
// the model cannot keep exactly) shows a plain text box instead, with the same label.
export default function DocumentEditor({ label, value, baseText, onChange, onBlur, describedBy, autoFocus = false, forcePlain = false }: {
  label: string
  value: string
  baseText: string | null
  onChange: (markdown: string) => void
  onBlur?: () => void
  describedBy?: string
  autoFocus?: boolean
  forcePlain?: boolean
}) {
  // Decided once at mount, like the document itself: switching mid-edit would drop her undo history.
  const [plain] = useState(() => forcePlain || !isLosslessMarkdown(value))
  if (plain) {
    return <PlainEditor label={label} value={value} onChange={onChange} onBlur={onBlur} describedBy={describedBy} autoFocus={autoFocus} />
  }
  return <RichEditor label={label} value={value} baseText={baseText} onChange={onChange} onBlur={onBlur} describedBy={describedBy} autoFocus={autoFocus} />
}

function PlainEditor({ label, value, onChange, onBlur, describedBy, autoFocus }: {
  label: string
  value: string
  onChange: (markdown: string) => void
  onBlur?: () => void
  describedBy?: string
  autoFocus: boolean
}) {
  const [text, setText] = useState(value)
  const id = useId()
  return <div className={styles.wrap}>
    <label htmlFor={id} className={styles.label}>{label}</label>
    <textarea id={id} className={styles.surface} value={text} autoFocus={autoFocus} spellCheck
      aria-describedby={describedBy}
      onChange={(event) => { setText(event.target.value); onChange(event.target.value) }}
      onBlur={() => onBlur?.()} />
  </div>
}

function RichEditor({ label, value, baseText, onChange, onBlur, describedBy, autoFocus }: {
  label: string
  value: string
  baseText: string | null
  onChange: (markdown: string) => void
  onBlur?: () => void
  describedBy?: string
  autoFocus: boolean
}) {
  const host = useRef<HTMLDivElement>(null)
  const labelId = useId()
  const onChangeRef = useRef(onChange)
  const onBlurRef = useRef(onBlur)
  onChangeRef.current = onChange
  onBlurRef.current = onBlur

  useEffect(() => {
    const mount = host.current
    if (!mount) return
    const state = EditorState.create({
      doc: parseMarkdown(value),
      plugins: [
        history(),
        keymap({
          'Mod-b': toggleStrong, 'Mod-i': toggleEm, 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
          Enter: enter, 'Shift-Enter': insertHardBreak,
        }),
        keymap(baseKeymap),
        ...(baseText !== null ? [trackChangesPlugin(baseText)] : []),
      ],
    })
    const view: EditorView = new EditorView(mount, {
      state,
      attributes: {
        role: 'textbox', 'aria-multiline': 'true', 'aria-labelledby': labelId, class: styles.surface, spellcheck: 'true',
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      },
      dispatchTransaction(tr) {
        const next = view.state.apply(tr)
        view.updateState(next)
        if (tr.docChanged) onChangeRef.current(serializeMarkdown(next.doc))
      },
      handleDOMEvents: {
        blur: () => {
          onBlurRef.current?.()
          return false
        },
      },
    })
    editorViews.set(view.dom, view)
    if (autoFocus) view.focus()
    return () => {
      editorViews.delete(view.dom)
      view.destroy()
    }
    // The editor owns its document once mounted; a different value means a new editor (key it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div className={styles.wrap}>
    <span id={labelId} className={styles.label}>{label}</span>
    <div ref={host} />
  </div>
}
