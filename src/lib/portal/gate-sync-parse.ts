// Pure parser for scripts/sync-gates.ts (pack STATUS GATES block -> content_production_gates).
//
// Safety model: a gate is written only when its line is unambiguous. Every problem is scoped to
// the LINE (or, for duplicates, to that gate key): the line is skipped with a warning and the rest
// of the block still syncs. Nothing here ever fills in a missing state, owner or date.

export const AGENCY_GATES = new Set(['source-in-hand', 'design-built', 'proofed', 'approval-sent'])
// The other five of the nine gates: recognized, but synced via their own evidence paths, never here.
export const OUT_OF_SCOPE_GATES = new Set(['fact-check', 'copy-approved', 'scheduled', 'posted', 'link-confirmed'])
const OWNERS = new Set(['anastasia', 'studio', 'agent'])
// Owner spellings found in real packs, mapped onto the gates schema's owner_label check
// ('anastasia' | 'studio' | 'agent'). The Dot and Codex are agency-side, so both are `agent`.
const OWNER_ALIASES: Record<string, string> = { the_dot: 'agent', thedot: 'agent', codex: 'agent' }
const STATE: Record<string, 'open' | 'done' | 'na'> = { ' ': 'open', x: 'done', '~': 'na' }

// Loose head: `- [state] gate-key[:dest] [(parenthetical)] rest`
const HEAD = /^- \[([ x~])\]\s+([a-z][a-z-]*)(:[a-z]+)?(?:\s+(\([^)]*\)))?(?=\s|$)(.*)$/
// Strict tail after the head: ` @owner [date] [| note]`
const TAIL = /^\s+@(\w+)(?:\s+(\d{4}-\d{2}-\d{2}))?(?:\s*\|\s*(.*))?$/
// Gate notes are agency-confidential provenance; still refuse a real email address (PII guard).
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}/i

export type Gate = { gateKey: string; state: 'open' | 'done' | 'na'; owner: string; date: string | null; note: string | null }
export type Block = { contentId: string; gates: Gate[]; warnings: string[] }

// Calendar-valid, not just shape-valid (JS rolls 2026-02-31 to Mar 3).
export function isValidDate(d: string): boolean {
  const [y, mo, day] = d.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, day))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === day
}

// Split a pack into gate BLOCKS: a `<!-- gates: content_id=X -->` marker INSIDE a `## STATUS GATES`
// section, running to the next H2 / next marker / EOF. Markers elsewhere are never gate blocks.
export function parseGateFile(text: string, file: string): { blocks: Block[]; warnings: string[] } {
  const warnings: string[] = []
  const blocks: Block[] = []
  let cur: { contentId: string; body: string[] } | null = null
  let inStatusGates = false
  const flush = () => { if (cur) { blocks.push(parseGateBlock(cur.contentId, cur.body)); cur = null } }
  for (const line of text.split('\n')) {
    if (/^##\s/.test(line)) {
      flush()
      inStatusGates = /status gates/i.test(line)
      continue
    }
    if (/<!--\s*gates:/.test(line)) {
      if (!inStatusGates) continue
      flush()
      const cid = line.match(/\bcontent_id=([\w-]+)/)
      if (!cid) { warnings.push(`${file}: a STATUS GATES block has no content_id= (skipped)`); continue }
      cur = { contentId: cid[1], body: [] }
      continue
    }
    if (cur) cur.body.push(line)
  }
  flush()
  return { blocks, warnings }
}

export function parseGateBlock(contentId: string, body: string[]): Block {
  const warnings: string[] = []
  const candidates: { key: string; gate: Gate | null }[] = []
  const short = (l: string) => l.trim().slice(0, 60)

  for (const line of body) {
    if (!/^- \[/.test(line.trim())) continue
    const head = line.match(HEAD)
    if (!head) { warnings.push(`not a gate line: ${short(line)}`); continue }
    const [, s, gateKey, dest, paren, rest] = head
    if (OUT_OF_SCOPE_GATES.has(gateKey)) {
      // Recognized but owned by another evidence path. Silent when well-formed, noted otherwise.
      if (!TAIL.test(rest)) warnings.push(`${gateKey}: not synced here (ignored): ${short(line)}`)
      continue
    }
    if (!AGENCY_GATES.has(gateKey)) { warnings.push(`unknown gate key '${gateKey}' (line skipped)`); continue }
    const fail = (why: string) => { warnings.push(`${gateKey}: ${why} (line skipped)`); candidates.push({ key: gateKey, gate: null }) }
    if (dest) { fail(`destination suffix '${dest}' not allowed (piece-level table)`); continue }
    const tail = rest.match(TAIL)
    if (!tail) { fail(/@\w/.test(rest) ? 'does not match the gate grammar' : 'no @owner'); continue }
    const [, rawOwner, date, rawNote] = tail
    const owner = OWNER_ALIASES[rawOwner] ?? rawOwner
    if (!OWNERS.has(owner)) { fail(`owner @${rawOwner} is not an agency owner`); continue }
    if (date && !isValidDate(date)) { fail(`'${date}' is not a valid calendar date`); continue }
    const state = STATE[s]
    const note = [paren, rawNote?.trim()].filter(Boolean).join(' ') || null
    if (state === 'done' && !date) { fail('done without a date (no provenance, no close)'); continue }
    if (state === 'na' && !note) { fail('n/a without a reason'); continue }
    if (note && EMAIL.test(note)) { fail('note contains an email address; gate notes must not carry PII'); continue }
    candidates.push({ key: gateKey, gate: { gateKey, state, owner, date: date ?? null, note } })
  }

  // Two lines for one gate is ambiguous even when one of them is bad: write neither.
  const counts = new Map<string, number>()
  for (const c of candidates) counts.set(c.key, (counts.get(c.key) ?? 0) + 1)
  const gates: Gate[] = []
  const reported = new Set<string>()
  for (const c of candidates) {
    const n = counts.get(c.key)!
    if (n > 1) {
      if (!reported.has(c.key)) { warnings.push(`${c.key}: ${n} lines for this gate, ambiguous (gate skipped)`); reported.add(c.key) }
      continue
    }
    if (c.gate) gates.push(c.gate)
  }
  return { contentId, gates, warnings }
}

// Normalized provenance tuple, so an owner/date/note correction (not just a state flip) is detected.
export function fileTuple(g: Gate): string {
  return [g.state, g.date ?? '', g.owner, g.note ?? '', g.state === 'na' ? (g.note ?? '') : ''].join('|')
}
export function portalTuple(row: { state: string; owner_label: string | null; occurred_at: string | null; note: string | null; na_reason: string | null }): string {
  return [row.state, (row.occurred_at ?? '').slice(0, 10), row.owner_label ?? '', row.note ?? '', row.na_reason ?? ''].join('|')
}
