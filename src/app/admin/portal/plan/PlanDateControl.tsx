'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function PlanDateControl({
  clientSlug,
  contentId,
  initialDate,
}: {
  clientSlug: string
  contentId: string
  initialDate: string | null
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate ?? '')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/portal/plan-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientSlug,
          contentId,
          plannedDate: date || null,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const result = await response.json() as { error?: string }
      if (!response.ok) throw new Error(result.error || 'Could not save the plan date')
      setMessage(date ? 'Saved' : 'Unscheduled')
      router.refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save the plan date')
    } finally {
      setSaving(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <input
        aria-label={`Planned date for ${contentId}`}
        type="date"
        value={date}
        onChange={(event) => setDate(event.target.value)}
        disabled={saving}
        style={{ font: 'inherit', border: '1px solid var(--line, #dedbd4)', padding: '5px 7px', background: 'var(--paper, #fff)' }}
      />
      <button type="button" onClick={save} disabled={saving} style={{ font: 'inherit', padding: '5px 8px', cursor: saving ? 'wait' : 'pointer' }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {message && <span role="status" style={{ fontSize: 12, color: message === 'Saved' || message === 'Unscheduled' ? 'inherit' : '#9b2c2c' }}>{message}</span>}
    </span>
  )
}
