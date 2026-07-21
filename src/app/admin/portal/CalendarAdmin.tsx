'use client'

import { useState } from 'react'
import styles from './portal-admin.module.css'
import StatusPill, { type PillTone } from './StatusPill'

export type CalendarIntegrationAdmin = {
  id: string; clientId: string; clientName: string; displayName: string; ownerEmail: string
  accessRole: string; status: string; health: string; lastFullSync: string|null
  lastIncrementalSync: string|null; nextReconcile: string|null; lastError: string|null
  openConflicts: number; unmappedEvents: number; failedJobs: number
}
export type CalendarConflictAdmin = { id: string; integrationId: string; kind: string; summary: string; createdAt: string }
export type UnmappedCalendarEventAdmin = { id: string; clientId: string; summary: string|null; start: string|null; reason: string }
export type CalendarContentOption = { id: string; clientId: string; version: number; title: string }

// Sync health -> pill tone (presentation only; the raw health string is unchanged upstream).
function healthTone(health: string): PillTone {
  const h = health.toLowerCase()
  if (h.includes('health') || h === 'ok' || h === 'active') return 'verified'
  if (h.includes('error') || h.includes('fail')) return 'failed'
  return 'pending'
}

export default function CalendarAdmin({ clients, integrations, conflicts = [], unmapped = [], contentOptions = [] }: {
  clients: Array<{ id: string; name: string }>; integrations: CalendarIntegrationAdmin[]
  conflicts?: CalendarConflictAdmin[]
  unmapped?: UnmappedCalendarEventAdmin[]; contentOptions?: CalendarContentOption[]
}) {
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [calendarId, setCalendarId] = useState('')
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('')
  const [mappingSelections, setMappingSelections] = useState<Record<string,string>>({})
  async function connect() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/portal/calendar/oauth/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId, calendarId }),
      })
      const body = await response.json() as { authorizationUrl?: string; error?: string }
      if (!response.ok || !body.authorizationUrl) throw new Error(body.error ?? 'Authorization failed')
      window.location.assign(body.authorizationUrl)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Authorization failed'); setBusy(false) }
  }
  async function run() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/portal/calendar/run', { method: 'POST' })
      const body = await response.json() as { claimed?: number; succeeded?: number; error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Worker failed')
      setMessage(`Processed ${body.succeeded ?? 0} of ${body.claimed ?? 0} queued jobs. Refresh to see current health.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Worker failed') }
    finally { setBusy(false) }
  }
  async function resolve(conflictId: string, resolution: 'portal'|'google') {
    const note = window.prompt(resolution === 'portal'
      ? 'Explain why the portal date should be projected back to Google:'
      : 'Explain why the Google change should be accepted:')
    if (!note) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/portal/calendar/conflicts', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ conflictId, resolution,
          note, idempotencyKey: `calendar-resolution:${crypto.randomUUID()}` }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Resolution failed')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Resolution failed'); setBusy(false) }
  }
  async function linkUnmapped(event: UnmappedCalendarEventAdmin, options: CalendarContentOption[]) {
    const option = options.find((value) => value.id === mappingSelections[event.id])
    if (!option) return
    const note = window.prompt('Record why this exact Google event belongs to the selected portal piece:')
    if (!note) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/portal/calendar/unmapped', { method: 'POST',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ unmappedId: event.id,
          action: 'link', contentId: option.id, contentVersion: option.version, note,
          idempotencyKey: `calendar-link:${crypto.randomUUID()}` }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Mapping failed')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Mapping failed'); setBusy(false) }
  }
  async function ignoreUnmapped(event: UnmappedCalendarEventAdmin) {
    const note = window.prompt('Explain why this existing event is not portal content:')
    if (!note) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/portal/calendar/unmapped', { method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'ignore', unmappedId: event.id, note }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? 'Ignore failed')
      window.location.reload()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ignore failed'); setBusy(false) }
  }
  return <>
    <div className={styles.cardHead}>
      <div>
        <div className={styles.cardTitle}>Shared Google Calendar</div>
        <div className={styles.cardSub}>Supabase remains authoritative. Calendar edits may move an eligible editorial hold, but never approve copy or prove that a destination was scheduled or published.</div>
      </div>
    </div>
    {integrations.map((item) => <article key={item.id} className={styles.subCard}>
      <div className={styles.pubPieceHead}>
        <span className={styles.subCardTitle}>{item.clientName} · {item.displayName}</span>
        <StatusPill tone={healthTone(item.health)} label={item.health} />
      </div>
      <div className={styles.metaLine}>{item.status} · OAuth account {item.ownerEmail} ({item.accessRole})</div>
      <div className={styles.metaLine}>Last incremental sync: {item.lastIncrementalSync ? new Date(item.lastIncrementalSync).toLocaleString() : 'Never'}.
        {' '}Next reconciliation: {item.nextReconcile ? new Date(item.nextReconcile).toLocaleString() : 'Not scheduled'}.</div>
      <div className={styles.metaLine}>Open conflicts: {item.openConflicts} · Unmapped events: {item.unmappedEvents} · Failed jobs: {item.failedJobs}</div>
      {item.lastError && <div className={styles.errorText}>{item.lastError}</div>}
    </article>)}
    {conflicts.length > 0 && <div>
      <div className={styles.groupLabel}>Open reconciliation conflicts</div>
      {conflicts.map((conflict) => <article key={conflict.id} className={`${styles.subCard} ${styles.subCardWarn}`}>
        <div className={styles.metaLine}><strong>{conflict.kind.replaceAll('_',' ')}</strong> · {conflict.summary}</div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} disabled={busy} onClick={() => resolve(conflict.id,'portal')}>Keep portal date</button>
          {conflict.kind !== 'mapping_integrity' && <button type="button" className={styles.btn} disabled={busy}
            onClick={() => resolve(conflict.id,'google')}>Accept Google change</button>}
        </div>
      </article>)}
    </div>}
    {unmapped.length > 0 && <div>
      <div className={styles.groupLabel}>Unmapped existing events</div>
      <p className={styles.metaLine}>Review each exact event. Titles are never used automatically to select a tenant or content item.</p>
      {unmapped.map((event) => {
        const options = contentOptions.filter((item) => item.clientId === event.clientId)
        return <article key={event.id} className={`${styles.subCard} ${styles.subCardWarn}`}>
          <div className={styles.metaLine}><strong>{event.summary || 'Untitled event'}</strong> · {event.start || 'No usable date'} · {event.reason}</div>
          <div className={styles.actions}>
            <select className={`${styles.select} ${styles.controlAuto}`} value={mappingSelections[event.id] ?? ''} disabled={busy}
              onChange={(change) => setMappingSelections((current) => ({ ...current, [event.id]: change.target.value }))}>
              <option value="">Select the reviewed portal piece</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.title} · v{option.version}</option>)}
            </select>
            <button type="button" className={styles.btn} disabled={busy || !mappingSelections[event.id]}
              onClick={() => linkUnmapped(event,options)}>Link reviewed event</button>
            <button type="button" className={styles.btn} disabled={busy} onClick={() => ignoreUnmapped(event)}>Ignore unrelated event</button>
          </div>
        </article>
      })}
    </div>}
    <div className={styles.form}>
      <label className={styles.field}><span className={styles.fieldLabel}>Client</span>
        <select className={styles.select} value={clientId} onChange={(event) => setClientId(event.target.value)} disabled={busy}>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select></label>
      <label className={styles.field}><span className={styles.fieldLabel}>Exact existing Google Calendar ID</span>
        <input className={styles.input} value={calendarId}
          onChange={(event) => setCalendarId(event.target.value)} disabled={busy} required /></label>
      <div className={styles.actions}>
        <button type="button" className={styles.btn} onClick={connect} disabled={busy || !clientId || !calendarId}>Connect existing calendar</button>
        <button type="button" className={styles.btn} onClick={run} disabled={busy || integrations.length === 0}>Run reconciliation</button>
      </div>
      {message && <p className={styles.statusMsg} role="status">{message}</p>}
    </div>
  </>
}
