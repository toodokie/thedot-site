export type GoogleEvent = {
  id: string; etag: string; updated: string; status?: string; htmlLink?: string
  summary?: string; description?: string
  start?: { date?: string; dateTime?: string; timeZone?: string }
  end?: { date?: string; dateTime?: string; timeZone?: string }
  extendedProperties?: { private?: Record<string, string> }
}

export function stableEditorialKey(integrationId: string, contentId: string): string {
  return `portal:${integrationId}:${contentId}:editorial`
}

export function safeEditorialEvent(input: {
  integrationId: string; clientId: string; contentId: string; version: number
  revision: number; title: string; plannedDate: string
}) {
  const next = new Date(`${input.plannedDate}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return {
    summary: input.title.slice(0, 300),
    description: 'Editorial coordination hold. Approval, copy, provider scheduling, and publication remain authoritative in the client portal.',
    start: { date: input.plannedDate }, end: { date: next.toISOString().slice(0, 10) },
    transparency: 'transparent', visibility: 'default',
    extendedProperties: { private: {
      portal_integration_id: input.integrationId, portal_client_id: input.clientId,
      portal_content_id: input.contentId, portal_content_version: String(input.version),
      portal_schedule_target_id: '', portal_object_revision: String(input.revision),
      portal_mapping_key: stableEditorialKey(input.integrationId, input.contentId),
    } },
  }
}

export function googleEventStart(event: GoogleEvent): { date: string | null; startAt: string | null; endAt: string | null } {
  if (event.start?.date && event.end?.date) return { date: event.start.date, startAt: null, endAt: null }
  if (event.start?.dateTime && event.end?.dateTime) return { date: null, startAt: event.start.dateTime, endAt: event.end.dateTime }
  return { date: null, startAt: null, endAt: null }
}
