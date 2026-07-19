import { createHash } from 'node:crypto'
import { parseContentFile } from './frontmatter'

type EditPatch = {
  blockKey: string
  originalChecksum: string
  proposedText: string
}

type CreatePatch = {
  title: string
  brief: string
  platforms: string[]
  desiredDate: string
  notes: string | null
}

function checksum(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function internalSuffix(raw: string): { before: string; suffix: string } {
  const matches = [...raw.matchAll(/<!--\s*internal\s*-->/gi)]
  if (matches.length !== 1 || matches[0].index === undefined) {
    throw new Error('Canonical source must contain exactly one internal marker')
  }
  return { before: raw.slice(0, matches[0].index), suffix: raw.slice(matches[0].index) }
}

export function applyCanonicalEdit(
  raw: string,
  sourcePath: string,
  expectedVersion: number,
  patch: EditPatch,
): { raw: string; version: number; before: string; after: string } {
  const parsed = parseContentFile(raw, sourcePath)
  if (parsed.version !== expectedVersion) throw new Error('Canonical file version no longer matches the request')
  const block = parsed.copy_blocks.find((candidate) => candidate.key === patch.blockKey)
  if (!block) throw new Error('Requested copy block no longer exists')
  if (checksum(block.body) !== patch.originalChecksum) throw new Error('Requested copy block checksum is stale')
  const proposed = patch.proposedText.trim()
  if (!proposed || proposed === block.body.trim()) throw new Error('Proposed copy is empty or unchanged')

  const { before: publicPart, suffix } = internalSuffix(raw)
  const newline = raw.includes('\r\n') ? '\r\n' : '\n'
  const control = new RegExp(
    `(^[ \\t]*<!--\\s*portal-block:${escapeRegExp(patch.blockKey)}\\s*-->[ \\t]*\\r?\\n##[ \\t]+[^\\r\\n]+\\r?\\n)`,
    'm',
  )
  const match = control.exec(publicPart)
  if (!match || match.index === undefined) throw new Error('Requested copy block source is malformed')
  const bodyStart = match.index + match[0].length
  const nextControl = /\r?\n[ \t]*<!--\s*portal-block:[a-z0-9][a-z0-9_-]{0,63}\s*-->[ \t]*(?:\r?\n|$)/g
  nextControl.lastIndex = bodyStart
  const next = nextControl.exec(publicPart)
  const bodyEnd = next?.index ?? publicPart.length
  const rawBody = publicPart.slice(bodyStart, bodyEnd)
  const trailing = rawBody.match(/(?:\r?\n[ \t]*)+$/)?.[0] ?? newline + newline
  const normalizedProposal = proposed.replace(/\r?\n/g, newline)
  const editedPublic = publicPart.slice(0, bodyStart) + normalizedProposal + trailing
    + publicPart.slice(bodyEnd)
  const versionPattern = /^([ \t]*version:[ \t]*)\d+([ \t]*)$/gm
  const versionMatches = [...editedPublic.matchAll(versionPattern)]
  if (versionMatches.length !== 1) throw new Error('Canonical frontmatter must contain exactly one numeric version')
  const nextVersion = expectedVersion + 1
  const bumpedPublic = editedPublic.replace(versionPattern, `$1${nextVersion}$2`)
  const result = bumpedPublic + suffix
  if (!result.endsWith(suffix)) throw new Error('Internal section preservation failed')
  const reparsed = parseContentFile(result, sourcePath)
  if (reparsed.version !== nextVersion
      || reparsed.copy_blocks.find((candidate) => candidate.key === patch.blockKey)?.body !== proposed) {
    throw new Error('Reconciled canonical source failed round-trip validation')
  }
  return { raw: result, version: nextVersion, before: block.body, after: proposed }
}

export function buildCanonicalCreate(
  contentId: string,
  clientSlug: string,
  patch: CreatePatch,
  sourcePath: string,
): string {
  if (!/^[a-z0-9][a-z0-9._-]{1,119}$/.test(contentId)) throw new Error('Invalid canonical content id')
  const claim = patch.brief.replace(/\s+/g, ' ').trim().slice(0, 500)
  const notes = patch.notes ? `\nClient request notes:\n${patch.notes.trim()}` : ''
  const raw = `---
portal_kind: content
content_id: ${contentId}
client: ${clientSlug}
title: ${JSON.stringify(patch.title.trim())}
format: null
pillar: null
platforms: ${JSON.stringify(patch.platforms)}
scheduled_date: ${JSON.stringify(patch.desiredDate)}
status: draft
version: 1
fact_check: needs-confirm
fact_check_scope: required
fact_check_exemption: null
fact_check_ledger:
  - claim_key: requested-brief-review
    claim: ${JSON.stringify(claim)}
    status: needs-confirm
    source_url: null
    source_title: null
    checked_at: ${JSON.stringify(new Date().toISOString().slice(0, 10))}
    checked_by_role: agency_owner
---
<!-- portal-block:requested-brief -->
## Requested brief
${patch.brief.trim()}

<!-- internal -->
Created from client request. This is an internal working draft and cannot pass the release gate until The Dot authors and fact-checks the actual copy.${notes}
`
  parseContentFile(raw, sourcePath)
  return raw
}
