export type PostedHistoryRow = {
  date: string
  piece: string
  format: string
  pillar: string
  producer: string
  provenanceText: string
}

export type HistoryMapping = {
  piece: string
  content_id: string
  destinations: Array<{
    destination: 'instagram' | 'facebook' | 'youtube' | 'squarespace' | 'other'
    published_at: string
    provenance: 'yt_check' | 'public_url' | 'legacy_unverified'
    live_url?: string | null
    provider_object_id?: string | null
    evidence_url?: string | null
    attestation_note?: string | null
    visibility?: 'public' | 'unlisted' | 'other'
  }>
}

export function parsePostedHistoryMarkdown(raw: string): PostedHistoryRow[] {
  const rows: PostedHistoryRow[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('| 20')) continue
    const cells = line.split('|').slice(1, -1).map((value) => value.trim())
    if (cells.length !== 6 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    rows.push({ date: cells[0], piece: cells[1], format: cells[2], pillar: cells[3],
      producer: cells[4], provenanceText: cells[5] })
  }
  if (rows.length === 0) throw new Error('No posted-history timeline rows found')
  const keys = new Set<string>()
  for (const row of rows) {
    const key = `${row.date}:${row.piece}`
    if (keys.has(key)) throw new Error(`Duplicate posted-history row: ${key}`)
    keys.add(key)
  }
  return rows
}

export function parseHistoryMappings(value: unknown): HistoryMapping[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Mapping must be an object')
  const entries = (value as { entries?: unknown }).entries
  if (!Array.isArray(entries)) throw new Error('Mapping entries must be an array')
  return entries.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Bad mapping entry ${index}`)
    const entry = raw as Record<string, unknown>
    if (typeof entry.piece !== 'string' || !entry.piece.trim()
      || typeof entry.content_id !== 'string' || !entry.content_id.trim()
      || !Array.isArray(entry.destinations) || entry.destinations.length === 0) {
      throw new Error(`Incomplete mapping entry ${index}`)
    }
    const destinations = entry.destinations.map((destination, destinationIndex) => {
      if (!destination || typeof destination !== 'object' || Array.isArray(destination)) {
        throw new Error(`Bad destination ${index}.${destinationIndex}`)
      }
      const item = destination as Record<string, unknown>
      if (typeof item.destination !== 'string'
        || !['instagram','facebook','youtube','squarespace','other'].includes(item.destination)
        || typeof item.published_at !== 'string' || Number.isNaN(Date.parse(item.published_at))
        || typeof item.provenance !== 'string'
        || !['yt_check','public_url','legacy_unverified'].includes(item.provenance)) {
        throw new Error(`Incomplete destination ${index}.${destinationIndex}`)
      }
      return item as unknown as HistoryMapping['destinations'][number]
    })
    return { piece: entry.piece.trim(), content_id: entry.content_id.trim(), destinations }
  })
}
