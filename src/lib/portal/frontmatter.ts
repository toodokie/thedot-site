import matter from 'gray-matter'
import { assertClientSafeContent } from './content-safety'
import { parsePrimarySourceUrl } from './primary-source-policy'

const STATUS = ['idea', 'draft', 'approved', 'scheduled', 'posted']
const FACT = ['confirmed', 'needs-confirm', 'flagged']
const FACT_SCOPE = ['required', 'not_applicable']
const CHECKED_BY_ROLE = ['agency_fact_checker', 'agency_owner']

export type FactCheckStatus = 'confirmed' | 'needs-confirm' | 'flagged'
export type FactCheckScope = 'required' | 'not_applicable'
export type FactCheckLedgerEntry = {
  claim_key: string
  claim: string
  status: FactCheckStatus
  source_url: string | null
  source_title: string | null
  checked_at: string
  checked_by_role: 'agency_fact_checker' | 'agency_owner'
}

export type ParsedContent = {
  portal_kind: 'content'
  content_id: string
  client: string
  title: string
  format: string | null
  pillar: string | null
  platforms: string[]
  scheduled_date: string | null
  status: string
  canva_url: string | null
  drive_url: string | null
  version: number
  fact_check: FactCheckStatus
  fact_check_scope: FactCheckScope
  fact_check_exemption: string | null
  fact_check_ledger: FactCheckLedgerEntry[]
  client_body: string
  copy_blocks: { key: string; label: string; body: string }[]
  internal_notes: string | null
  source_path: string
}

function requiredString(value: unknown, key: string, source: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string in ${source}`)
  }
  return value.trim()
}

function optionalString(value: unknown, key: string, source: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') throw new Error(`${key} must be a string in ${source}`)
  return value.trim() || null
}

function parseEnum(
  value: unknown,
  allowed: string[],
  key: string,
  source: string,
  fallback: string | null,
): string | null {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`Bad ${key} "${String(value)}" in ${source}`)
  }
  return value
}

function parseVersion(value: unknown, source: string): number {
  if (value === undefined || value === null) return 1
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`version must be an integer >= 1 in ${source}`)
  }
  return value
}

function parsePlatforms(value: unknown, source: string): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every((x) => typeof x === 'string' && x.trim())) {
    throw new Error(`platforms must be an array of non-empty strings in ${source}`)
  }
  return value.map((x) => (x as string).trim())
}

// Every client-facing copy block has a stable machine key that survives label edits and reordering:
//   <!-- portal-block:ig-facebook-caption -->
//   ## Instagram + Facebook caption
// Control comments are removed from client_body before anything can reach the client.
function parseCopyBlocks(clientBody: string, source: string): { key: string; label: string; body: string }[] {
  const blocks: { key: string; label: string; body: string }[] = []
  let current: { key: string; label: string; lines: string[] } | null = null
  let pendingKey: string | null = null
  for (const line of clientBody.split('\n')) {
    const control = /^\s*<!--\s*portal-block:([a-z0-9][a-z0-9_-]{0,63})\s*-->\s*$/.exec(line)
    if (control) {
      if (pendingKey) throw new Error(`Portal block "${pendingKey}" has no heading in ${source}`)
      if (current) {
        blocks.push({ key: current.key, label: current.label, body: current.lines.join('\n').trim() })
        current = null
      }
      pendingKey = control[1]
      continue
    }
    const heading = /^##\s+(.+?)\s*$/.exec(line)  // H2 only: `### ` (H3) has no space after `##`
    if (heading) {
      if (!pendingKey) throw new Error(`Copy block heading is missing a portal-block key in ${source}`)
      current = { key: pendingKey, label: heading[1].trim(), lines: [] }
      pendingKey = null
    } else if (pendingKey) {
      if (line.trim()) throw new Error(`Portal block "${pendingKey}" must be followed by an H2 heading in ${source}`)
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (pendingKey) throw new Error(`Portal block "${pendingKey}" has no heading in ${source}`)
  if (current) blocks.push({ key: current.key, label: current.label, body: current.lines.join('\n').trim() })
  if (blocks.length === 0) throw new Error(`At least one keyed portal copy block is required in ${source}`)
  const keys = new Set<string>()
  for (const block of blocks) {
    if (!block.label) throw new Error(`Copy block label must not be empty in ${source}`)
    if (!block.body) throw new Error(`Copy block "${block.key}" body must not be empty in ${source}`)
    if (keys.has(block.key)) throw new Error(`Duplicate portal block key "${block.key}" in ${source}`)
    keys.add(block.key)
  }
  return blocks
}

// scheduled_date MUST be a quoted "YYYY-MM-DD" string. gray-matter's YAML turns an UNQUOTED date
// into a JS Date and silently rolls over invalid components (2026-02-31 -> Mar 3, a full timestamp
// shifts by timezone), which could move a publication date with no error. So we reject non-strings
// and validate that the value is a real calendar date.
function ymd(value: unknown, source: string, key = 'scheduled_date'): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new Error(`${key} must be a quoted YYYY-MM-DD string in ${source}`)
  }
  const s = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Bad ${key} "${s}" in ${source}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid ${key} "${s}" in ${source}`)
  }
  return s
}

function boundedString(
  value: unknown,
  key: string,
  source: string,
  min: number,
  max: number,
): string {
  const parsed = requiredString(value, key, source)
  if (parsed.length < min || parsed.length > max) {
    throw new Error(`${key} must be ${min}-${max} characters in ${source}`)
  }
  return parsed
}

function parseFactCheckLedger(
  value: unknown,
  scope: FactCheckScope,
  exemption: string | null,
  source: string,
): FactCheckLedgerEntry[] {
  if (!Array.isArray(value)) throw new Error(`fact_check_ledger must be an array in ${source}`)

  const allowedKeys = new Set([
    'claim_key', 'claim', 'status', 'source_url', 'source_title', 'checked_at', 'checked_by_role',
  ])
  const seen = new Set<string>()
  const today = new Date().toISOString().slice(0, 10)
  const entries = value.map((raw, index): FactCheckLedgerEntry => {
    const itemSource = `${source} fact_check_ledger[${index}]`
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error(`fact_check_ledger entries must be objects in ${itemSource}`)
    }
    const item = raw as Record<string, unknown>
    for (const key of Object.keys(item)) {
      if (!allowedKeys.has(key)) throw new Error(`Unknown fact_check_ledger key "${key}" in ${itemSource}`)
    }

    const claim_key = boundedString(item.claim_key, 'claim_key', itemSource, 1, 64)
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(claim_key)) {
      throw new Error(`Bad claim_key "${claim_key}" in ${itemSource}`)
    }
    if (seen.has(claim_key)) throw new Error(`Duplicate claim_key "${claim_key}" in ${source}`)
    seen.add(claim_key)

    const claim = boundedString(item.claim, 'claim', itemSource, 1, 500)
    const status = parseEnum(item.status, FACT, 'status', itemSource, null) as FactCheckStatus | null
    if (!status) throw new Error(`status is required in ${itemSource}`)
    const checked_by_role = parseEnum(
      item.checked_by_role,
      CHECKED_BY_ROLE,
      'checked_by_role',
      itemSource,
      null,
    ) as FactCheckLedgerEntry['checked_by_role'] | null
    if (!checked_by_role) throw new Error(`checked_by_role is required in ${itemSource}`)
    const checked_at = ymd(item.checked_at, itemSource, 'checked_at')
    if (!checked_at) throw new Error(`checked_at is required in ${itemSource}`)
    if (checked_at > today) throw new Error(`checked_at must not be in the future in ${itemSource}`)

    const rawSourceUrl = optionalString(item.source_url, 'source_url', itemSource)
    const source_url = rawSourceUrl ? parsePrimarySourceUrl(rawSourceUrl, itemSource) : null
    const source_title = optionalString(item.source_title, 'source_title', itemSource)
    if ((source_url === null) !== (source_title === null)) {
      throw new Error(`source_url and source_title must be provided together in ${itemSource}`)
    }
    if (source_title && source_title.length > 300) {
      throw new Error(`source_title must be 1-300 characters in ${itemSource}`)
    }
    if (status === 'confirmed' && (!source_url || !source_title)) {
      throw new Error(`confirmed ledger entries require source_url and source_title in ${itemSource}`)
    }

    return { claim_key, claim, status, source_url, source_title, checked_at, checked_by_role }
  })

  if (scope === 'required') {
    if (exemption) throw new Error(`fact_check_exemption is not allowed for required scope in ${source}`)
    if (entries.length === 0) throw new Error(`required fact_check_scope needs at least one ledger entry in ${source}`)
  } else {
    if (!exemption) throw new Error(`not_applicable fact_check_scope requires fact_check_exemption in ${source}`)
    if (entries.length !== 0) throw new Error(`not_applicable fact_check_scope requires an empty ledger in ${source}`)
  }
  return entries
}

export function parseContentFile(raw: string, sourcePath: string): ParsedContent {
  const { data, content } = matter(raw)

  // Validate all frontmatter fields first, so a missing content_id or bad status/date fails
  // before any body handling. Strict typing: no truthiness coercion that would let [] become "",
  // a bare string become an empty platforms array, or version 0 silently become 1.
  const portalKind = requiredString(data.portal_kind, 'portal_kind', sourcePath)
  if (portalKind !== 'content') throw new Error(`Unsupported portal_kind "${portalKind}" in ${sourcePath}`)
  const content_id = requiredString(data.content_id, 'content_id', sourcePath)
  const client = requiredString(data.client, 'client', sourcePath)
  const title = requiredString(data.title, 'title', sourcePath)
  const format = optionalString(data.format, 'format', sourcePath)
  const pillar = optionalString(data.pillar, 'pillar', sourcePath)
  const platforms = parsePlatforms(data.platforms, sourcePath)
  const scheduled_date = ymd(data.scheduled_date, sourcePath)
  const status = parseEnum(data.status, STATUS, 'status', sourcePath, 'draft') as string
  const fact_check = parseEnum(
    data.fact_check,
    FACT,
    'fact_check',
    sourcePath,
    null,
  ) as FactCheckStatus | null
  if (!fact_check) throw new Error(`fact_check is required in ${sourcePath}`)
  const fact_check_scope = parseEnum(
    data.fact_check_scope,
    FACT_SCOPE,
    'fact_check_scope',
    sourcePath,
    null,
  ) as FactCheckScope | null
  if (!fact_check_scope) throw new Error(`fact_check_scope is required in ${sourcePath}`)
  const fact_check_exemption = optionalString(
    data.fact_check_exemption,
    'fact_check_exemption',
    sourcePath,
  )
  if (fact_check_exemption && (fact_check_exemption.length < 10 || fact_check_exemption.length > 300)) {
    throw new Error(`fact_check_exemption must be 10-300 characters in ${sourcePath}`)
  }
  const fact_check_ledger = parseFactCheckLedger(
    data.fact_check_ledger,
    fact_check_scope,
    fact_check_exemption,
    sourcePath,
  )
  const version = parseVersion(data.version, sourcePath)
  const canva_url = optionalString(data.canva_url, 'canva_url', sourcePath)
  const drive_url = optionalString(data.drive_url, 'drive_url', sourcePath)

  // Body: require EXACTLY ONE internal marker. A missing or misspelled marker must never dump the
  // whole body (internal text included) into client_body, so files without notes still end with an
  // empty marker. Rejecting >1 marker also fixes the old silent-discard of text after a second one.
  const marker = /<!--\s*internal\s*-->/gi
  const matches = [...content.matchAll(marker)]
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one <!-- internal --> marker in ${sourcePath}; found ${matches.length}`)
  }
  const idx = matches[0].index!
  const rawClientBody = content.slice(0, idx)
  const internal = content.slice(idx + matches[0][0].length)
  if (!rawClientBody.trim()) throw new Error(`Empty client body in ${sourcePath}`)
  const copy_blocks = parseCopyBlocks(rawClientBody, sourcePath)
  const client_body = rawClientBody
    .split('\n')
    .filter((line) => !/^\s*<!--\s*portal-block:[^>]+-->\s*$/.test(line))
    .join('\n')

  const parsed: ParsedContent = {
    portal_kind: 'content',
    content_id,
    client,
    title,
    format,
    pillar,
    platforms,
    scheduled_date,
    status,
    canva_url,
    drive_url,
    version,
    fact_check,
    fact_check_scope,
    fact_check_exemption,
    fact_check_ledger,
    client_body,
    copy_blocks,
    internal_notes: internal.trim() ? internal.trim() : null,
    source_path: sourcePath,
  }
  assertClientSafeContent(parsed, sourcePath)
  return parsed
}
