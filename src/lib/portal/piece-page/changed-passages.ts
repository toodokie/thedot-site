// "Updated after your feedback" (spec 2026-10-03 sections 4.1, 4.3, 4.7): which tabs changed in
// this version and which paragraphs to mark. Read-only; derived from the request records.
import type { ContentRequestRow } from '@/lib/portal/requests'
import type { CopyTab } from './copy-tabs'

export function splitParagraphs(body: string): string[] {
  // CRLF splits exactly like LF; for an LF body this is the same split as /\n[ \t]*\n+/.
  return body.split(/\r?\n[ \t]*\r?\n(?:\r?\n)*/).map((part) => part.replace(/^(?:\r?\n)+/, '').replace(/\s+$/, '')).filter(Boolean)
}

function normal(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function changedParagraphs(before: string | null, after: string): boolean[] {
  const chunks = splitParagraphs(after)
  if (before === null) return chunks.map(() => false)
  const seen = new Set(splitParagraphs(before).map(normal))
  return chunks.map((chunk) => !seen.has(normal(chunk)))
}

export type AppliedChanges = { before: Map<string, string>; visualsChanged: boolean }

function isAppliedEdit(request: ContentRequestRow): boolean {
  return request.request_type === 'edit' && ['applied', 'superseded'].includes(request.status)
    && request.base_version !== null && request.canonical_version !== null && request.base_version < request.canonical_version
}

// Her applied edits shown on a piece she has already decided (one review, 2026-09-14). The agency
// may release later versions after applying them (the Oct 5 news roundup: edits applied into v2, a
// YouTube-only courtesy release made v3), so this takes her latest review round applied into this
// version or an earlier one, not only into this exact version.
export function decidedAppliedChanges(version: number, requests: ContentRequestRow[]): AppliedChanges {
  const applied = requests.filter((request) => isAppliedEdit(request) && (request.canonical_version as number) <= version)
  if (!applied.length) return { before: new Map(), visualsChanged: false }
  const round = Math.max(...applied.map((request) => request.base_version as number))
  return collectChanges(applied.filter((request) => request.base_version === round))
}

export function appliedChanges(version: number, requests: ContentRequestRow[]): AppliedChanges {
  return collectChanges(requests.filter((request) => isAppliedEdit(request) && request.canonical_version === version))
}

function collectChanges(requests: ContentRequestRow[]): AppliedChanges {
  const before = new Map<string, { text: string; base: number }>()
  let visualsChanged = false
  for (const request of requests) {
    if (request.base_version === null) continue
    const kind = typeof request.payload.target_kind === 'string' ? request.payload.target_kind : 'copy_block'
    if (kind !== 'copy_block') { visualsChanged = true; continue }
    const key = typeof request.payload.target_key === 'string' ? request.payload.target_key
      : typeof request.payload.block_key === 'string' ? request.payload.block_key : null
    if (!key || typeof request.base_copy_text !== 'string') continue
    const seen = before.get(key)
    if (!seen || request.base_version < seen.base) before.set(key, { text: request.base_copy_text, base: request.base_version })
  }
  return { before: new Map([...before].map(([key, value]) => [key, value.text])), visualsChanged }
}

export function updatedTabKeys(tabs: CopyTab[], changes: AppliedChanges): Set<string> {
  return new Set(tabs.filter((tab) => tab.kind !== 'chapters'
    && tab.blocks.some((block) => block.key !== null && changes.before.has(block.key))).map((tab) => tab.key))
}

function areaName(label: string): string {
  if (label === 'YouTube' || label.startsWith('PDF')) return label
  return label.charAt(0).toLowerCase() + label.slice(1)
}

export function updatedAreasLine(tabs: CopyTab[], updated: Set<string>, visualsChanged: boolean): string {
  const names = tabs.filter((tab) => updated.has(tab.key)).map((tab) => areaName(tab.label))
  if (visualsChanged) names.push('visuals')
  return names.join(', ')
}
