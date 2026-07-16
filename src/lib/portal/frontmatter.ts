import matter from 'gray-matter'

const STATUS = ['idea', 'draft', 'approved', 'scheduled', 'posted']
const FACT = ['confirmed', 'needs-confirm', 'flagged']

export type ParsedContent = {
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
  fact_check: string | null
  client_body: string
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

// scheduled_date MUST be a quoted "YYYY-MM-DD" string. gray-matter's YAML turns an UNQUOTED date
// into a JS Date and silently rolls over invalid components (2026-02-31 -> Mar 3, a full timestamp
// shifts by timezone), which could move a publication date with no error. So we reject non-strings
// and validate that the value is a real calendar date.
function ymd(value: unknown, source: string): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') {
    throw new Error(`scheduled_date must be a quoted YYYY-MM-DD string in ${source}`)
  }
  const s = value.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) throw new Error(`Bad scheduled_date "${s}" in ${source}`)
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid scheduled_date "${s}" in ${source}`)
  }
  return s
}

export function parseContentFile(raw: string, sourcePath: string): ParsedContent {
  const { data, content } = matter(raw)

  // Validate all frontmatter fields first, so a missing content_id or bad status/date fails
  // before any body handling. Strict typing: no truthiness coercion that would let [] become "",
  // a bare string become an empty platforms array, or version 0 silently become 1.
  const content_id = requiredString(data.content_id, 'content_id', sourcePath)
  const client = requiredString(data.client, 'client', sourcePath)
  const title = requiredString(data.title, 'title', sourcePath)
  const format = optionalString(data.format, 'format', sourcePath)
  const pillar = optionalString(data.pillar, 'pillar', sourcePath)
  const platforms = parsePlatforms(data.platforms, sourcePath)
  const scheduled_date = ymd(data.scheduled_date, sourcePath)
  const status = parseEnum(data.status, STATUS, 'status', sourcePath, 'draft') as string
  const fact_check = parseEnum(data.fact_check, FACT, 'fact_check', sourcePath, null)
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
  const client_body = content.slice(0, idx)
  const internal = content.slice(idx + matches[0][0].length)
  if (!client_body.trim()) throw new Error(`Empty client body in ${sourcePath}`)

  return {
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
    client_body,
    internal_notes: internal.trim() ? internal.trim() : null,
    source_path: sourcePath,
  }
}
