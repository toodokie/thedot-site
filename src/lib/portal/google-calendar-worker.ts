import 'server-only'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import {
  accessForIntegration, GoogleCalendarError, googleJson, newChannelId,
  randomSecret, sha256, webhookAddress,
} from './google-calendar'
import { googleEventStart, safeEditorialEvent, stableEditorialKey, type GoogleEvent } from './google-calendar-values'

type Job = {
  id: string; integration_id: string; client_id: string
  job_type: 'outbound'|'incremental'|'full'|'renew_watch'|'reconcile'|'acl_check'
  payload: Record<string, unknown>; lease_token: string; attempts: number
}

type GoogleEventsPage = { items?: GoogleEvent[]; nextPageToken?: string; nextSyncToken?: string }

async function rpc(name: string, args: Record<string, unknown>) {
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}

async function reconcileStaleGoogleEvent(accessToken: string, integrationId: string,
  calendar: string, eventId: string) {
  try {
    const current = await googleJson<GoogleEvent>(accessToken,
      `/calendars/${calendar}/events/${encodeURIComponent(eventId)}`)
    await applyInboundEvent(integrationId, current)
  } catch (error) {
    if (!(error instanceof GoogleCalendarError && (error.status === 404 || error.status === 410))) throw error
    await rpc('apply_calendar_editorial_event', { p_integration_id: integrationId,
      p_event_id: eventId, p_event_etag: `deleted:${Date.now()}`,
      p_event_updated_at: new Date().toISOString(), p_event_start_date: null, p_deleted: true })
  }
}

async function outbound(job: Job) {
  const contentId = String(job.payload.content_id ?? '')
  const version = Number(job.payload.content_version)
  const revision = Number(job.payload.portal_revision)
  if (!contentId.match(/^[0-9a-f-]{36}$/i) || !Number.isInteger(version) || !Number.isInteger(revision)) {
    throw new Error('Invalid outbound calendar payload')
  }
  const admin = createSupabaseAdmin()
  const [{ integration, accessToken }, contentResult, versionResult, mappingResult] = await Promise.all([
    accessForIntegration(job.integration_id),
    admin.from('content_items').select('id,client_id,client_visible,client_visible_version,planned_date,projection_revision,archived_at')
      .eq('id', contentId).eq('client_id', job.client_id).single(),
    admin.from('content_item_versions').select('title').eq('content_item_id', contentId)
      .eq('client_id', job.client_id).eq('version', version).single(),
    admin.from('calendar_event_mappings').select('*').eq('integration_id', job.integration_id)
      .eq('stable_key', stableEditorialKey(job.integration_id, contentId)).maybeSingle(),
  ])
  if (contentResult.error || versionResult.error) throw new Error('Outbound content snapshot unavailable')
  const content = contentResult.data
  const mapping = mappingResult.data
  if (!content.client_visible || content.client_visible_version !== version || content.archived_at) return
  const calendar = encodeURIComponent(integration.calendar_id)
  if (!content.planned_date) {
    if (mapping && mapping.sync_status !== 'deleted') {
      try {
        await googleJson(accessToken, `/calendars/${calendar}/events/${encodeURIComponent(mapping.event_id)}`, {
          method: 'DELETE', headers: { 'If-Match': mapping.event_etag },
        })
      } catch (error) {
        if (error instanceof GoogleCalendarError && (error.status === 404 || error.status === 410)) {
          // The desired state is already reached.
        } else if (error instanceof GoogleCalendarError && error.status === 412) {
          await reconcileStaleGoogleEvent(accessToken, job.integration_id, calendar, mapping.event_id)
          return
        } else throw error
      }
      await admin.from('calendar_event_mappings').update({ sync_status: 'deleted',
        last_outbound_at: new Date().toISOString(), last_reconciled_at: new Date().toISOString() }).eq('id', mapping.id)
    }
    return
  }
  const stableKey = stableEditorialKey(job.integration_id, contentId)
  const body = safeEditorialEvent({ integrationId: job.integration_id, clientId: job.client_id,
    contentId, version, revision: content.projection_revision, title: versionResult.data.title,
    plannedDate: content.planned_date })
  let event: GoogleEvent
  if (mapping && mapping.sync_status !== 'deleted') {
    try {
      event = await googleJson(accessToken, `/calendars/${calendar}/events/${encodeURIComponent(mapping.event_id)}`, {
        method: 'PUT', headers: { 'If-Match': mapping.event_etag }, body: JSON.stringify(body),
      })
    } catch (error) {
      if (error instanceof GoogleCalendarError && error.status === 412) {
        await reconcileStaleGoogleEvent(accessToken, job.integration_id, calendar, mapping.event_id)
        return
      }
      throw error
    }
  } else {
    // A create timeout is ambiguous. Search by our opaque stable property and adopt exactly one.
    const query = new URLSearchParams({ showDeleted: 'false', singleEvents: 'true',
      privateExtendedProperty: `portal_mapping_key=${stableKey}` })
    const found = await googleJson<GoogleEventsPage>(accessToken, `/calendars/${calendar}/events?${query}`)
    if ((found.items?.length ?? 0) > 1) throw new Error('Duplicate Google events share a portal mapping key')
    event = found.items?.[0] ?? await googleJson(accessToken, `/calendars/${calendar}/events`, {
      method: 'POST', body: JSON.stringify(body),
    })
  }
  if (!event.id || !event.etag || !event.updated) throw new Error('Google event response is incomplete')
  const start = googleEventStart(event)
  await rpc('confirm_calendar_projection', {
    p_integration_id: job.integration_id, p_content_id: contentId, p_content_version: version,
    p_schedule_target_id: null, p_event_role: 'editorial_plan', p_stable_key: stableKey,
    p_event_id: event.id, p_event_etag: event.etag, p_event_updated_at: event.updated,
    p_event_html_link: event.htmlLink ?? null, p_event_start_date: start.date,
    p_event_start_at: start.startAt, p_event_end_at: start.endAt,
    p_portal_revision: content.projection_revision,
  })
}

function privateMapping(event: GoogleEvent) { return event.extendedProperties?.private ?? {} }

async function applyInboundEvent(integrationId: string, event: GoogleEvent) {
  const admin = createSupabaseAdmin()
  if (!event.id) return
  const start = googleEventStart(event)
  const recordUnmapped = async (reason: string) => rpc('record_calendar_unmapped_event', {
    p_integration_id: integrationId, p_event_id: event.id, p_event_etag: event.etag ?? null,
    p_event_updated_at: event.updated ?? null, p_event_summary: event.summary ?? null,
    p_event_start_date: start.date, p_event_start_at: start.startAt, p_event_end_at: start.endAt,
    p_reason: reason,
  })
  const privateFields = privateMapping(event)
  const stableKey = privateFields.portal_mapping_key
  const { data: eventMapping, error: eventMappingError } = await admin.from('calendar_event_mappings')
    .select('id,client_id,integration_id,event_id,event_role,stable_key,portal_projection_revision')
    .eq('integration_id', integrationId).eq('event_id', event.id).maybeSingle()
  if (eventMappingError) throw new Error(eventMappingError.message)
  if (eventMapping) {
    if (eventMapping.event_role !== 'editorial_plan') throw new Error('Timed calendar summaries require agency reconciliation')
    if (event.status === 'cancelled') {
      await rpc('apply_calendar_editorial_event', { p_integration_id: integrationId,
        p_event_id: event.id, p_event_etag: event.etag, p_event_updated_at: event.updated,
        p_event_start_date: null, p_deleted: true })
      return
    }
    if (stableKey !== eventMapping.stable_key || privateFields.portal_integration_id !== integrationId) {
      await recordUnmapped('invalid_private_key')
      const summary = 'A mapped Google event has invalid portal identity fields; agency review is required.'
      const key = `${eventMapping.id}:${event.etag}:mapping-integrity`
      const { error: conflictError } = await admin.from('calendar_sync_conflicts').upsert({
        client_id: eventMapping.client_id, integration_id: integrationId, mapping_id: eventMapping.id,
        conflict_key: key, kind: 'mapping_integrity', portal_revision: eventMapping.portal_projection_revision,
        google_etag: event.etag, google_start_date: start.date, google_deleted: false,
        safe_summary: summary, status: 'open',
      }, { onConflict: 'integration_id,conflict_key', ignoreDuplicates: true })
      if (conflictError) throw new Error(conflictError.message)
      await admin.from('calendar_event_mappings').update({ sync_status: 'conflicted', last_error: summary })
        .eq('id', eventMapping.id)
      return
    }
    await rpc('apply_calendar_editorial_event', { p_integration_id: integrationId,
      p_event_id: event.id, p_event_etag: event.etag, p_event_updated_at: event.updated,
      p_event_start_date: start.date, p_deleted: false })
    return
  }
  if (!stableKey) {
    await recordUnmapped('missing_private_key')
    return
  }
  if (privateFields.portal_integration_id !== integrationId) {
    await recordUnmapped('wrong_integration')
    return
  }
  const { data: mapping, error } = await admin.from('calendar_event_mappings').select('id,event_id,event_role')
    .eq('integration_id', integrationId).eq('stable_key', stableKey).maybeSingle()
  if (error) throw new Error(error.message)
  if (!mapping || mapping.event_id !== event.id) {
    await recordUnmapped('unknown_mapping')
    return
  }
  if (mapping.event_role !== 'editorial_plan') {
    throw new Error('Timed calendar summaries require agency reconciliation')
  }
  await rpc('apply_calendar_editorial_event', {
    p_integration_id: integrationId, p_event_id: event.id, p_event_etag: event.etag,
    p_event_updated_at: event.updated, p_event_start_date: start.date,
    p_deleted: event.status === 'cancelled',
  })
}

async function syncEvents(job: Job, forceFull = false) {
  const admin = createSupabaseAdmin()
  const { integration, accessToken } = await accessForIntegration(job.integration_id)
  const { data: state, error } = await admin.from('calendar_sync_state').select('sync_token')
    .eq('integration_id', job.integration_id).single()
  if (error) throw new Error(error.message)
  const full = forceFull || !state.sync_token
  let pageToken: string | undefined
  let nextSyncToken: string | undefined
  do {
    const query = new URLSearchParams({ showDeleted: 'true', singleEvents: 'true', maxResults: '2500' })
    if (!full && state.sync_token) query.set('syncToken', state.sync_token)
    if (pageToken) query.set('pageToken', pageToken)
    let page: GoogleEventsPage
    try {
      page = await googleJson(accessToken,
        `/calendars/${encodeURIComponent(integration.calendar_id)}/events?${query}`)
    } catch (error) {
      if (!full && error instanceof GoogleCalendarError && error.status === 410) {
        return syncEvents(job, true)
      }
      throw error
    }
    for (const event of page.items ?? []) await applyInboundEvent(job.integration_id, event)
    pageToken = page.nextPageToken
    nextSyncToken = page.nextSyncToken ?? nextSyncToken
  } while (pageToken)
  if (!nextSyncToken) throw new Error('Google full/incremental sync returned no terminal sync token')
  await rpc('complete_calendar_sync', { p_integration_id: job.integration_id,
    p_sync_token: nextSyncToken, p_full: full })
}

async function renewWatch(job: Job) {
  const admin = createSupabaseAdmin()
  const { integration, accessToken } = await accessForIntegration(job.integration_id)
  const channelId = newChannelId(), token = randomSecret(32)
  const expiration = Date.now() + 6 * 24 * 60 * 60 * 1000
  const response = await googleJson<{ id: string; resourceId: string; expiration?: string }>(accessToken,
    `/calendars/${encodeURIComponent(integration.calendar_id)}/events/watch`, {
      method: 'POST', body: JSON.stringify({ id: channelId, type: 'web_hook', address: webhookAddress(),
        token, expiration: String(expiration) }),
    })
  if (response.id !== channelId || !response.resourceId) throw new Error('Google watch response is incomplete')
  const expiresAt = new Date(Number(response.expiration ?? expiration)).toISOString()
  const { error } = await admin.from('calendar_watch_channels').insert({
    integration_id: job.integration_id, client_id: job.client_id, channel_id: channelId,
    resource_id: response.resourceId, token_hash: sha256(token), expires_at: expiresAt,
  })
  if (error) throw new Error(error.message)
  // Keep overlap for dropped/racing notifications; then stop the remote and local old channels.
  const { data: oldChannels } = await admin.from('calendar_watch_channels').select('id,channel_id,resource_id')
    .eq('integration_id', job.integration_id).neq('channel_id', channelId)
    .lt('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()).is('stopped_at', null)
  for (const old of oldChannels ?? []) {
    try {
      await googleJson(accessToken, '/channels/stop', { method: 'POST',
        body: JSON.stringify({ id: old.channel_id, resourceId: old.resource_id }) })
    } catch (error) {
      if (!(error instanceof GoogleCalendarError && error.status === 404)) throw error
    }
    await admin.from('calendar_watch_channels').update({ stopped_at: new Date().toISOString() }).eq('id', old.id)
  }
}

async function checkAcl(job: Job) {
  const admin = createSupabaseAdmin()
  const { integration, accessToken } = await accessForIntegration(job.integration_id)
  const id = encodeURIComponent(integration.calendar_id)
  const [entry, acl] = await Promise.all([
    googleJson<{ accessRole: string }>(accessToken, `/users/me/calendarList/${id}`),
    googleJson<{ items?: Array<{ scope?: { type?: string; value?: string }; role?: string }> }>(accessToken, `/calendars/${id}/acl`),
  ])
  const reader = process.env.GOOGLE_CALENDAR_CLIENT_READER_EMAIL?.toLowerCase()
  if (!reader) throw new Error('GOOGLE_CALENDAR_CLIENT_READER_EMAIL is not configured')
  const hasPublicAcl = (acl.items ?? []).some((rule) => rule.scope?.type === 'default' && rule.role !== 'none')
  const hasReader = (acl.items ?? []).some((rule) => rule.scope?.type === 'user'
    && rule.scope.value?.toLowerCase() === reader && rule.role === 'reader')
  const healthy = ['owner','writer'].includes(entry.accessRole) && !hasPublicAcl && hasReader
  await admin.from('calendar_sync_state').update({ health: healthy ? 'healthy' : 'acl_drift',
    last_error: healthy ? null : 'Calendar ACL or integration role drift requires review',
    updated_at: new Date().toISOString() }).eq('integration_id', job.integration_id)
  if (!healthy) throw new Error('Calendar ACL drift detected')
}

async function reconcile(job: Job) {
  await checkAcl(job)
  await syncEvents(job, false)
  const admin = createSupabaseAdmin()
  const { data: content, error } = await admin.from('content_items')
    .select('id,client_visible_version,projection_revision').eq('client_id', job.client_id)
    .eq('client_visible', true).is('archived_at', null)
  if (error) throw new Error(error.message)
  for (const item of content ?? []) {
    await admin.from('calendar_sync_jobs').upsert({ integration_id: job.integration_id,
      client_id: job.client_id, job_type: 'outbound',
      dedupe_key: `reconcile:${item.id}:r${item.projection_revision}:${new Date().toISOString().slice(0, 13)}`,
      payload: { content_id: item.id, content_version: item.client_visible_version,
        portal_revision: item.projection_revision },
    }, { onConflict: 'integration_id,dedupe_key', ignoreDuplicates: true })
  }
}

async function runJob(job: Job) {
  if (job.job_type === 'outbound') return outbound(job)
  if (job.job_type === 'full') return syncEvents(job, true)
  if (job.job_type === 'incremental') return syncEvents(job, false)
  if (job.job_type === 'renew_watch') return renewWatch(job)
  if (job.job_type === 'acl_check') return checkAcl(job)
  return reconcile(job)
}

export async function enqueueCalendarMaintenance() {
  const admin = createSupabaseAdmin()
  const { data: integrations, error } = await admin.from('calendar_integrations')
    .select('id,client_id,calendar_sync_state(next_reconcile_at),calendar_watch_channels(expires_at,stopped_at)')
    .eq('status', 'active')
  if (error) throw new Error(error.message)
  const now = Date.now(), hour = new Date().toISOString().slice(0, 13)
  for (const integration of integrations ?? []) {
    const stateRaw = integration.calendar_sync_state as unknown
    const state = (Array.isArray(stateRaw) ? stateRaw[0] : stateRaw) as { next_reconcile_at?: string } | null
    const channels = (integration.calendar_watch_channels ?? []) as Array<{ expires_at: string; stopped_at: string|null }>
    const activeExpiry = channels.filter((c) => !c.stopped_at).map((c) => Date.parse(c.expires_at)).sort().at(-1)
    const jobs: Array<{ type: Job['job_type']; key: string }> = []
    if (!activeExpiry || activeExpiry < now + 36 * 60 * 60 * 1000) jobs.push({ type: 'renew_watch', key: `renew:${hour}` })
    if (!state?.next_reconcile_at || Date.parse(state.next_reconcile_at) <= now) jobs.push({ type: 'reconcile', key: `reconcile:${hour}` })
    for (const value of jobs) await admin.from('calendar_sync_jobs').upsert({
      integration_id: integration.id, client_id: integration.client_id, job_type: value.type,
      dedupe_key: value.key, payload: {},
    }, { onConflict: 'integration_id,dedupe_key', ignoreDuplicates: true })
  }
}

export async function runCalendarWorker(limit = 10): Promise<{ claimed: number; succeeded: number }> {
  const jobs = await rpc('claim_calendar_sync_jobs', { p_limit: limit, p_lease_seconds: 300 }) as Job[]
  let succeeded = 0
  for (const job of jobs ?? []) {
    try {
      await runJob(job)
      await rpc('finish_calendar_sync_job', { p_job_id: job.id, p_lease_token: job.lease_token,
        p_succeeded: true, p_error: null })
      succeeded++
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Calendar job failed'
      const health = error instanceof GoogleCalendarError && (error.status === 400 || error.status === 401)
        ? 'reauth_required' : error instanceof GoogleCalendarError && error.status === 404
          ? 'calendar_missing' : message.includes('ACL') ? 'acl_drift' : 'degraded'
      try { await rpc('record_calendar_sync_failure', { p_integration_id: job.integration_id,
        p_health: health, p_error: message }) } catch { /* preserve the original job failure */ }
      await rpc('finish_calendar_sync_job', { p_job_id: job.id, p_lease_token: job.lease_token,
        p_succeeded: false, p_error: message })
    }
  }
  return { claimed: jobs?.length ?? 0, succeeded }
}
