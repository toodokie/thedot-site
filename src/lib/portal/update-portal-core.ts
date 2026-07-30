// Pure, I/O-free core for the `update-portal` flow (spec:
// Kanset/docs/superpowers/specs/2026-07-24-default-portal-update-flow-design.md, §4/§14).
//
// This module owns the deterministic decisions so the CLI (scripts/update-portal.ts) stays a thin
// I/O shell (fs + git + Supabase + portal-admin). Everything here is unit-tested.
//
// Design (per the 2026-07-24 verification, §14):
//  - Extraction is a REAL step: a pack is not canonical form. We pull the client-copy region
//    (first `<!-- portal-block: -->` marker .. the single `<!-- internal -->` marker) VERBATIM.
//  - The canonical frontmatter (incl. the structured fact_check_ledger) is AUTHORED, not generated
//    (Anastasia's ruling 2026-07-24). We preserve it and only refresh the body + bump `version`.
//  - Change detection is NORMALIZED (whitespace-insensitive) so a cosmetic edit never advances a
//    version — the sync RPC's checksum is byte-exact, so this gate lives here, not in the DB.
import { parseContentFile } from './frontmatter'

export const CONTENT_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,119}$/

// Matches frontmatter.ts exactly so extraction and the parser agree on block boundaries.
const PORTAL_BLOCK_LINE = /^[ \t]*<!--\s*portal-block:([a-z0-9][a-z0-9_-]{0,63})\s*-->[ \t]*\r?$/
const INTERNAL_MARKER = /<!--\s*internal\s*-->/gi
const GATE_HEADER = /<!--\s*gates:[^>]*-->/gi
const FRONTMATTER_BLOCK = /^(---\r?\n[\s\S]*?\r?\n---\r?\n)/
const VERSION_LINE = /^([ \t]*version:[ \t]*)\d+([ \t]*)\r?$/gm

export type ContentState = 'new' | 'unreleased' | 'released' | 'locked'

// What the CLI should DO, decided from (state, normalized-change, flags). One place, so the state
// matrix (§4.5/§4.6) can't drift between preview and apply.
export type UpdateAction =
  | 'noop'            // no normalized change — already in sync
  | 'create'          // new piece: scaffold canonical + sync v1 (unreleased)
  | 'sync'            // unreleased + changed: refresh canonical + sync in place, no re-arm
  | 'flag-reshare'    // released + changed: FLAG ONLY (§0.1). Human runs --re-share.
  | 'refuse-locked'   // a destination is verified live — never overwrite a shipped version
  | 'reshare'         // human --re-share path: begin-revision -> sync v+1 -> mark-ready
  | 'refuse-no-change-note' // --re-share without a --change-note

export type ClientEditRequestState = 'pending' | 'applying' | 'prepared' | 'applied' | 'answered' | 'conflicted' | 'rejected' | 'superseded'

export type ExtractedPack = {
  packId: string | null
  contentId: string
  clientBody: string            // verbatim: first portal-block .. internal marker
  blockKeys: string[]
  factCheckGate: 'closed' | 'open' | 'na' | 'absent'
}

function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value
}

// Read the canonical content_id (and the pack's own filename id) from the pack's gate header:
//   <!-- gates: id=<pack-id> content_id=<canonical-id> date=... -->
// Refuses on a missing id or on two headers that disagree (§0.4 / F: content_id integrity).
export function readPackContentId(packText: string, source: string): { packId: string | null; contentId: string } {
  const headers = [...stripBom(packText).matchAll(GATE_HEADER)].map((m) => m[0])
  if (headers.length === 0) {
    throw new Error(`No <!-- gates: ... --> header found in ${source}; cannot resolve content_id`)
  }
  const contentIds = new Set<string>()
  const packIds = new Set<string>()
  for (const header of headers) {
    // Capture case-sensitively (incl. any stray uppercase) so a non-lowercase id fails the
    // CONTENT_ID_PATTERN check below rather than being silently coerced to a different filename.
    const cid = /content_id=([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(header)?.[1]
    if (cid) contentIds.add(cid)
    const pid = /\bid=([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(header)?.[1]
    if (pid) packIds.add(pid)
  }
  if (contentIds.size === 0) {
    throw new Error(`Gate header in ${source} has no content_id=<canonical-id>`)
  }
  if (contentIds.size > 1) {
    throw new Error(`Ambiguous content_id in ${source}: ${[...contentIds].join(', ')}`)
  }
  const contentId = [...contentIds][0]
  if (!CONTENT_ID_PATTERN.test(contentId)) {
    throw new Error(`Invalid content_id "${contentId}" in ${source}`)
  }
  return { packId: packIds.size === 1 ? [...packIds][0] : null, contentId }
}

// Report the pack's machine-readable fact-check gate state (§0.3 / B). SECTION-SCOPED: only a
// `- [ ] fact-check` line INSIDE the `## STATUS GATES` section counts, using the same H2 scoping as
// sync-gates.ts (a quoted/internal/example line elsewhere can never mask the real gate). Rejects
// multiple fact-check markers in the section (ambiguous). A pack with no STATUS GATES section (an
// evergreen reel) -> 'absent', and the caller falls back to the canonical frontmatter's fact_check.
export function readFactCheckGate(packText: string): 'closed' | 'open' | 'na' | 'absent' {
  const states: string[] = []
  let inStatusGates = false
  for (const line of stripBom(packText).split('\n')) {
    if (/^##\s/.test(line)) { inStatusGates = /status gates/i.test(line); continue }
    if (!inStatusGates) continue
    const m = /^-\s*\[([ x~])\]\s+fact-check\b/.exec(line)
    if (m) states.push(m[1])
  }
  if (states.length === 0) return 'absent'
  if (states.length > 1) throw new Error('Multiple fact-check gate lines in the STATUS GATES section (ambiguous)')
  return states[0] === 'x' ? 'closed' : states[0] === '~' ? 'na' : 'open'
}

// Bounded, grammar-safe change note for --re-share (§4.6, Codex should-fix 10). A change note is
// attached to a released piece's revision, so it must be a single clean line.
export function validateChangeNote(note: string): string {
  const trimmed = note.trim()
  if (!trimmed) throw new Error('--change-note must be non-empty')
  if (trimmed.length > 300) throw new Error('--change-note must be <= 300 characters')
  if ([...trimmed].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) {
    throw new Error('--change-note must be a single line with no control characters')
  }
  return trimmed
}

// Pure versioning decision — the retry-aware heart of change detection (Codex blocker 3, round-2
// hardening). The next version is ALWAYS DB working_version + 1 (the DB is the source of truth).
// "changed" (there is work to do) is true when the copy changed OR a prior apply left work stranded:
//   - pendingSync: a canonical committed at EXACTLY working+1 never landed in the DB (sync failed);
//   - pendingRelease: a revision synced but was never released (mark_content_ready failed) — the DB
//     working version ran ahead of the client-visible version.
// `reconcile` fails closed (Codex SF4): a canonical version that is neither the DB working version nor
// working+1 (a gap > 1, or a canonical BEHIND the DB) is an inconsistency the tool must NOT silently
// "recover" by rebuilding a lower version (that would downgrade the canonical). The caller refuses and
// asks for manual reconciliation. Note: `pendingRelease` here only reports the version relationship;
// the caller additionally requires bodyChanged===false + canonical==working + revision_in_progress
// before using the release-retry path, so a pack changed since the stranded release can't publish
// stale content (Codex blocker 1).
export function planVersioning(input: {
  workingVersion: number            // 0 when the piece is new
  clientVisibleVersion: number      // 0 when never released
  canonicalVersion: number | null   // null when no canonical file exists
  bodyChanged: boolean
}): { changed: boolean; newVersion: number; pendingSync: boolean; pendingRelease: boolean; reconcile: boolean } {
  const cv = input.canonicalVersion
  const reconcile = cv !== null && (cv > input.workingVersion + 1 || cv < input.workingVersion)
  const pendingSync = cv !== null && cv === input.workingVersion + 1
  const pendingRelease = input.workingVersion > input.clientVisibleVersion && input.clientVisibleVersion > 0
  return {
    changed: input.bodyChanged || pendingSync || pendingRelease,
    newVersion: input.workingVersion + 1,
    pendingSync,
    pendingRelease,
    reconcile,
  }
}

// Flip the pack's `- [x] copy-approved` back to `- [ ]` ONLY inside the `## STATUS GATES` section
// (Codex SF7: same section scoping as readFactCheckGate, so a copy-approved-shaped line quoted in
// notes is never rewritten). Returns { text, found }; the caller fails loudly when !found.
export function reopenCopyApprovedGate(packText: string, changeNote: string): { text: string; found: boolean } {
  const lines = stripBom(packText).split('\n')
  let inStatusGates = false
  let found = false
  const out = lines.map((line) => {
    if (/^##\s/.test(line)) { inStatusGates = /status gates/i.test(line); return line }
    if (!inStatusGates) return line
    const m = /^(-\s*)\[([ x~])\](\s+copy-approved\b.*)$/i.exec(line)
    if (!m) return line
    found = true
    if (m[2] !== 'x') return line // already open / n/a -> idempotent
    return `${m[1]}[ ]${m[3]} | re-armed by update-portal: ${changeNote}`
  })
  return { text: out.join('\n'), found }
}

// The client-copy region of ANY portal file (pack or canonical): from the first
// `<!-- portal-block: -->` marker up to the single `<!-- internal -->` marker, VERBATIM. This is the
// exact text spliced into the canonical body, so nothing is paraphrased. Used for both extraction
// (from a pack) and change-detection (against the current canonical).
export function clientBodyRegion(text: string, source: string): { clientBody: string; blockKeys: string[] } {
  const raw = stripBom(text)
  const internal = [...raw.matchAll(INTERNAL_MARKER)]
  if (internal.length !== 1) {
    throw new Error(`Expected exactly one <!-- internal --> marker in ${source}; found ${internal.length}`)
  }
  const publicPart = raw.slice(0, internal[0].index)
  const lines = publicPart.split('\n')
  let firstBlockLine = -1
  const blockKeys: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const m = PORTAL_BLOCK_LINE.exec(lines[i])
    if (m) {
      if (firstBlockLine === -1) firstBlockLine = i
      blockKeys.push(m[1])
    }
  }
  if (firstBlockLine === -1) {
    throw new Error(`No <!-- portal-block: --> region found before the internal marker in ${source}`)
  }
  const clientBody = lines.slice(firstBlockLine).join('\n').replace(/\s+$/, '') + '\n'
  return { clientBody, blockKeys }
}

// Extract the client-copy region from a PACK plus its ids and fact-check gate state.
export function extractPack(packText: string, source: string): ExtractedPack {
  const { clientBody, blockKeys } = clientBodyRegion(packText, source)
  const { packId, contentId } = readPackContentId(packText, source)
  return { packId, contentId, clientBody, blockKeys, factCheckGate: readFactCheckGate(packText) }
}

// Normalize copy for change detection. §4.3: "formatting-only diffs do NOT count as a copy change."
// So we compare the TEXT, ignoring Markdown formatting (emphasis/code/strike markers, leading list /
// heading / blockquote markers) and whitespace/blank-line runs. A real word change still differs; a
// pack that only added `**bold**` or restyled a list does not spuriously advance a version / re-arm.
// This normalization is ONLY for the change decision — the synced copy is always the verbatim pack.
export function normalizeCopy(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      let l = line.trim()
      // Strip leading block markers (heading #, list -/*/+/1., blockquote >), possibly nested.
      let prev: string
      do { prev = l; l = l.replace(/^(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)/, '') } while (l !== prev)
      // Remove only paired Markdown wrappers. Do not erase semantic underscores, tildes,
      // asterisks, or backticks from ordinary copy, otherwise distinct copy can become a
      // false no-op (for example `C++`, `foo_bar`, or a literal * qualifier).
      l = l
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/__(.+?)__/g, '$1')
        .replace(/\*([^*\n]+?)\*/g, '$1')
        .replace(/_([^_\n]+?)_/g, '$1')
        .replace(/~~(.+?)~~/g, '$1')
        .replace(/`([^`\n]+?)`/g, '$1')
      return l.replace(/[ \t]+/g, ' ').trim()
    })
    .filter((line) => line !== '')
    .join('\n')
    .trim()
}

// Splice a freshly-extracted client body into an EXISTING canonical file, preserving its authored
// frontmatter + internal section and bumping `version` to `newVersion`. Round-trips through the real
// parser (structure + PII safety gate) before returning. Mirrors applyCanonicalEdit's rigor for the
// whole-body case.
export function buildRefreshedCanonical(
  existingCanonicalRaw: string,
  newClientBody: string,
  newVersion: number,
  sourcePath: string,
): string {
  const raw = stripBom(existingCanonicalRaw)
  const fm = FRONTMATTER_BLOCK.exec(raw)
  if (!fm) throw new Error(`Canonical ${sourcePath} has no leading YAML frontmatter block`)
  const internalMatches = [...raw.matchAll(INTERNAL_MARKER)]
  if (internalMatches.length !== 1 || internalMatches[0].index === undefined) {
    throw new Error(`Canonical ${sourcePath} must contain exactly one internal marker`)
  }
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const suffix = raw.slice(internalMatches[0].index)  // `<!-- internal -->` .. EOF, preserved verbatim

  const versionMatches = [...fm[1].matchAll(VERSION_LINE)]
  if (versionMatches.length !== 1) {
    throw new Error(`Canonical ${sourcePath} frontmatter must contain exactly one numeric version`)
  }
  const bumpedFrontmatter = fm[1].replace(VERSION_LINE, `$1${newVersion}$2`)

  const body = newClientBody.replace(/\r?\n/g, newline).replace(/\s+$/, '') + newline + newline
  const result = bumpedFrontmatter + body + suffix

  const reparsed = parseContentFile(result, sourcePath)
  if (reparsed.version !== newVersion) {
    throw new Error(`Refreshed canonical ${sourcePath} failed version round-trip`)
  }
  return result
}

// Decide the single action from state + normalized-change + flags. Encodes §4.5 (default matrix)
// and §4.6 (the human --re-share guard). Kept pure so preview and apply can never diverge.
export function decideAction(input: {
  state: ContentState
  changed: boolean
  isReshare: boolean
  hasChangeNote: boolean
}): { action: UpdateAction; reason: string } {
  const { state, changed, isReshare, hasChangeNote } = input

  if (state === 'locked') {
    return { action: 'refuse-locked', reason: 'a destination is verified live; a shipped version is frozen (correction = a new linked version)' }
  }

  if (isReshare) {
    if (state !== 'released') {
      return { action: changed ? (state === 'new' ? 'create' : 'sync') : 'noop', reason: '--re-share only applies to a released piece; falling back to the default path' }
    }
    if (!hasChangeNote) {
      return { action: 'refuse-no-change-note', reason: 're-arming Maria’s approval requires --change-note' }
    }
    if (!changed) {
      return { action: 'noop', reason: 'no normalized copy change; nothing to re-share' }
    }
    return { action: 'reshare', reason: 'human-confirmed re-share of a released piece' }
  }

  if (!changed) {
    return { action: 'noop', reason: 'already in sync (no normalized copy change)' }
  }
  if (state === 'new') {
    return { action: 'create', reason: 'new piece; scaffold canonical + sync v1 (unreleased)' }
  }
  if (state === 'unreleased') {
    return { action: 'sync', reason: 'unreleased piece; sync the updated copy in place (no re-arm)' }
  }
  // released + changed, default path
  return { action: 'flag-reshare', reason: 'released piece changed; FLAG ONLY — a human runs --re-share' }
}

// A portal edit request is an auditable, version-bound instruction. A generic re-share has no
// request id to settle, so letting it run while this is open can change the copy yet strand the
// client's request as "pending". The CLI uses this narrow pure guard before ANY re-share mutation.
export function openClientEditRequestBlocksReshare(requests: Array<{
  content_id: string | null
  request_type: string
  status: ClientEditRequestState | string
}>, contentId: string): boolean {
  return requests.some((request) => request.content_id === contentId
    && request.request_type === 'edit'
    && ['pending', 'applying', 'prepared'].includes(request.status))
}

// Derive the workflow state (§4.4) from the content_items row shape returned by Supabase.
export function deriveState(row: {
  client_visible_version: number | null
  publication_locked_version: number | null
} | null): ContentState {
  if (!row) return 'new'
  if (row.publication_locked_version !== null && row.publication_locked_version !== undefined) return 'locked'
  if (row.client_visible_version !== null && row.client_visible_version !== undefined) return 'released'
  return 'unreleased'
}
