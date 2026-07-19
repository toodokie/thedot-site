'use client'

import { useActionState, useEffect, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, Eyebrow, Text } from '@thedot/design-system'
import type { ScheduleRequestRow, ScheduleTargetRow } from '@/lib/portal/schedule'
import { requestScheduleChange } from '../../schedule-actions'

function SubmitButton({ ready, label }: { ready: boolean; label: string }) {
  const { pending } = useFormStatus()
  return (
    <Button as="button" type="submit" variant="black" size="sm" disabled={pending || !ready}>
      {pending ? 'Sending…' : label}
    </Button>
  )
}

function displayTime(value: string | null): string {
  if (!value) return 'Not confirmed'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value))
}

export default function SchedulePanel({
  slug,
  contentId,
  plannedDate,
  targets,
  requests,
  canRequest,
}: {
  slug: string
  contentId: string
  plannedDate: string | null
  targets: ScheduleTargetRow[]
  requests: ScheduleRequestRow[]
  canRequest: boolean
}) {
  const [state, action] = useActionState(
    async (_previous: { error?: string }, formData: FormData) => requestScheduleChange(formData),
    {},
  )
  const [idempotencyKey, setIdempotencyKey] = useState('')
  useEffect(() => setIdempotencyKey(`schedule-${crypto.randomUUID()}`), [])
  const activeRequest = requests.find((request) =>
    ['pending', 'applying', 'partially_applied'].includes(request.status),
  )
  const hasExternalTargets = targets.some((target) => target.required)

  return (
    <section aria-labelledby="schedule-heading" style={{
      margin: '32px 0', padding: '20px 0', borderTop: '1px solid var(--dot-hairline)',
      borderBottom: '1px solid var(--dot-hairline)',
    }}>
      <div id="schedule-heading"><Eyebrow tone="grey">Schedule</Eyebrow></div>
      <div style={{ marginTop: 10 }}>
        <Text tone="graphite">
          Editorial plan: {plannedDate ?? 'No date yet'}. Provider commitments are shown separately.
        </Text>
      </div>

      {targets.length === 0 ? (
        <div style={{ marginTop: 12 }}><Text tone="grey">No external publishing destination is assigned.</Text></div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '14px 0 0' }}>
          {targets.map((target) => (
            <li key={target.id} style={{
              display: 'flex', justifyContent: 'space-between', gap: 16,
              padding: '10px 0', borderTop: '1px solid var(--dot-hairline)',
            }}>
              <Text as="span" tone="black">{target.destination}</Text>
              <span style={{ textAlign: 'right' }}>
                <Text as="span" size="sm" tone="graphite">{displayTime(target.scheduled_at)}</Text>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--dot-graphite)' }}>
                  {target.status.replaceAll('_', ' ')} · {target.verification_label}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {activeRequest && (
        <div role="status" style={{ marginTop: 14, padding: 12, background: 'var(--dot-yellow-pale)' }}>
          <Text size="sm" tone="graphite">
            {activeRequest.request_kind === 'cancel' ? 'Unschedule' : 'Reschedule'} requested
            {activeRequest.requested_local
              ? ` for ${activeRequest.requested_local.slice(0, 16).replace('T', ' ')} Toronto time`
              : ''}. The current provider commitments remain in place until The Dot verifies each change.
          </Text>
        </div>
      )}

      {canRequest && !activeRequest && (
        <form action={action} style={{ marginTop: 18 }}>
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="contentId" value={contentId} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 12 }}>
            {hasExternalTargets ? (
              <>
                <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
                  Requested Toronto date and time
                  <input name="requestedLocal" type="datetime-local" required style={{ padding: '9px 10px' }} />
                </label>
                <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
                  Toronto offset
                  <select name="utcOffsetMinutes" required defaultValue="" style={{ padding: '9px 10px' }}>
                    <option value="" disabled>Choose EDT or EST</option>
                    <option value="-240">EDT (UTC−4)</option>
                    <option value="-300">EST (UTC−5)</option>
                  </select>
                </label>
              </>
            ) : (
              <label style={{ display: 'grid', gap: 5, fontSize: 13 }}>
                Editorial plan date
                <input name="plannedDate" type="date" required style={{ padding: '9px 10px' }} />
              </label>
            )}
            <SubmitButton
              ready={Boolean(idempotencyKey)}
              label={hasExternalTargets ? 'Request schedule change' : 'Update editorial plan'}
            />
          </div>
          {hasExternalTargets && (
            <div style={{ marginTop: 8 }}>
              <Text size="sm" tone="grey">
                Choose the offset in effect on that date. Invalid or skipped daylight-saving times are rejected.
              </Text>
            </div>
          )}
          {state?.error && (
            <p role="alert" style={{ color: '#c0392b', margin: '10px 0 0' }}>{state.error}</p>
          )}
        </form>
      )}
    </section>
  )
}
