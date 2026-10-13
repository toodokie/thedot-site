import { createHash } from 'node:crypto'
import { assertClientSafeContent } from './content-safety'
import { isAllowedClientVisibleHostname } from './public-contact-policy'

export function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} must be a non-empty string of at most ${max} characters`)
  }
  return value.trim()
}

export function optionalText(value: unknown, field: string, max: number): string | null {
  if (value === undefined || value === null || value === '') return null
  return requiredText(value, field, max)
}

export function assertClientSafeAgencyText(fields: Record<string, string | null>): void {
  const body = Object.entries(fields).filter(([, value]) => value).map(([key, value]) =>
    `## ${key}\n${value}`).join('\n\n')
  assertClientSafeContent({
    portal_kind: 'content', content_id: 'agency-write-preview', client: 'kanset',
    title: fields.title ?? 'Agency portal update', producer: null, calendar_note: null,
    format: null, pillar: null, platforms: [],
    scheduled_date: null, status: 'draft', canva_url: null, drive_url: null, version: 1,
    fact_check: 'confirmed', fact_check_scope: 'not_applicable',
    fact_check_exemption: 'Agency-owned client-safe surface update.', fact_check_ledger: [],
    client_body: body, copy_blocks: [], internal_notes: null, source_path: 'portal-write',
  }, 'portal-write')
}

export function assertReviewedHttpsUrl(value: unknown): string {
  const text = requiredText(value, 'url', 2048)
  const url = new URL(text)
  if (url.protocol !== 'https:' || url.username || url.password
      || !isAllowedClientVisibleHostname(url.hostname)) {
    throw new Error('url must use HTTPS on a reviewed client-visible host')
  }
  return text
}

export function assertReportMetrics(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('metrics must be an object')
  }
  for (const metric of Object.values(value)) {
    if (metric === null || typeof metric === 'number') continue
    if (!metric || typeof metric !== 'object' || Array.isArray(metric)) throw new Error('invalid metric value')
    const row = metric as Record<string, unknown>
    const keys = Object.keys(row).sort().join(',')
    if (!['value', 'prev,value'].includes(keys) || !['number', 'object'].includes(typeof row.value)
        || (row.value !== null && typeof row.value !== 'number')
        || (row.prev !== undefined && row.prev !== null && typeof row.prev !== 'number')) {
      throw new Error('schema v1 metrics must be numeric/null or { value, prev? }')
    }
  }
  return value as Record<string, unknown>
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
