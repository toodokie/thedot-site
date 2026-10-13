export type StatusGatesPatchResult =
  | { patched: true; output: string }
  | { patched: false; reason: 'not_found' | 'ambiguous' }

type GateBlockMatch = {
  start: number
  end: number
  header: string
  marker: string
  body: string
  ids: string[]
}

// A historical pack may retain a filename-derived `id` while carrying the durable
// portal identity as `content_id`. Match both, but never guess when either produces
// more than one candidate.
export function normalizeStatusGatesId(id: string): string {
  return id.replace(/^kanset-/, '').replace(/^\d{4}-\d{2}(-\d{2})?-/, '')
}

function markerValue(marker: string, key: string): string | null {
  const found = marker.match(new RegExp(`\\b${key}=([^\\s>]+)`))
  return found?.[1] ?? null
}

function findBlocks(source: string): GateBlockMatch[] {
  // The marker must immediately follow a STATUS GATES heading, apart from blank
  // whitespace-only lines. This prevents a copied marker elsewhere in a pack from
  // becoming a write target. The body is only checkbox rows, stopping before any
  // subsequent prose or Markdown heading.
  const pattern = /(^##[^\n]*\bSTATUS GATES\b[^\n]*\n(?:[ \t]*\n)*)(<!--[ \t]*gates:[^\n]*-->\n)((?:- \[[ x~]\][^\n]*(?:\n|$))*)/gim
  return [...source.matchAll(pattern)].flatMap((match) => {
    const marker = match[2]
    const ids = [markerValue(marker, 'content_id'), markerValue(marker, 'id')]
      .filter((value): value is string => value !== null)
    if (ids.length === 0) return []
    return [{
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      header: match[1],
      marker,
      body: match[3] ?? '',
      ids,
    }]
  })
}

function refreshedMarker(marker: string, renderedBlock: string): string {
  const renderedMarker = renderedBlock.split('\n').find((line) => line.startsWith('<!-- gates:'))
  const renderedDate = renderedMarker ? markerValue(renderedMarker, 'date') : null
  if (!renderedDate) return marker
  return /\bdate=[^\s>]+/.test(marker)
    ? marker.replace(/\bdate=[^\s>]+/, `date=${renderedDate}`)
    : marker.replace(/-->\n$/, ` date=${renderedDate} -->\n`)
}

function renderedGateRows(renderedBlock: string): string {
  const lines = renderedBlock.split('\n')
  const markerIndex = lines.findIndex((line) => line.startsWith('<!-- gates:'))
  return lines.slice(markerIndex + 1).filter((line) => /^- \[[ x~]\]/.test(line)).join('\n')
}


// The portal is authoritative for approval, scheduling, posting and link confirmation.
// It does NOT hold the four production gates unless they were separately emitted with
// `portal-write gate`, so a plain regenerate used to blank a closed local gate and its
// provenance note. Regenerating must never lose local evidence: for a production gate
// the portal wins only when the portal actually holds a value.
const PRODUCTION_GATE_KEYS = new Set(['source-in-hand', 'design-built', 'proofed', 'approval-sent'])

function gateKey(row: string): string | null {
  return /^- \[[ x~]\] ([a-z-]+(?::[a-z]+)?)/.exec(row)?.[1] ?? null
}

// An "unset" row is an open box carrying nothing but its key and optional owner:
// no date, no note. That is the portal saying "I have no record", not "this is open".
function isUnsetRow(row: string): boolean {
  return /^- \[ \] [a-z-]+(?::[a-z]+)?(?:[ \t]+@[\w-]+)?[ \t]*$/.test(row)
}

function mergeGateRows(localBody: string, renderedRows: string): string {
  const local = new Map<string, string>()
  for (const row of localBody.split('\n')) {
    const key = gateKey(row)
    if (key) local.set(key, row)
  }
  return renderedRows.split('\n').map((row) => {
    const key = gateKey(row)
    if (key === null) return row
    if (!PRODUCTION_GATE_KEYS.has(key.split(':')[0])) return row
    if (!isUnsetRow(row)) return row
    const kept = local.get(key)
    return kept !== undefined && !isUnsetRow(kept) ? kept : row
  }).join('\n')
}

export function patchStatusGatesBlock(
  source: string,
  contentId: string,
  renderedBlock: string,
): StatusGatesPatchResult {
  const blocks = findBlocks(source)
  const exact = blocks.filter((block) => block.ids.includes(contentId))
  let candidates = exact
  if (candidates.length === 0) {
    const normalized = normalizeStatusGatesId(contentId)
    candidates = blocks.filter((block) => block.ids.some((id) => normalizeStatusGatesId(id) === normalized))
  }
  if (candidates.length === 0) return { patched: false, reason: 'not_found' }
  if (candidates.length > 1) return { patched: false, reason: 'ambiguous' }

  const target = candidates[0]
  const rows = mergeGateRows(target.body, renderedGateRows(renderedBlock))
  const replacement = `${target.header}${refreshedMarker(target.marker, renderedBlock)}${rows}${rows ? '\n' : ''}`
  return {
    patched: true,
    output: source.slice(0, target.start) + replacement + source.slice(target.end),
  }
}
