'use client'

import { useState } from 'react'

export default function ReadOnlyPreview({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState('')
  return (
    <div
      data-maria-preview="read-only"
      onSubmitCapture={(event) => {
        event.preventDefault()
        event.stopPropagation()
        setNotice('Read-only preview: nothing was submitted.')
      }}
    >
      <div role="status" aria-live="polite" style={{
        position: 'sticky', top: 0, zIndex: 20, padding: '12px 16px',
        border: '2px solid var(--dot-black)', background: 'var(--dot-yellow)',
        color: 'var(--dot-black)', fontFamily: 'var(--dot-font-text)', fontSize: 14,
      }}>
        <strong>Viewing as Maria, read-only.</strong> You can open forms and test the flow. Submissions are blocked.
        {notice && <span style={{ display: 'block', marginTop: 4 }}>{notice}</span>}
      </div>
      {children}
    </div>
  )
}
