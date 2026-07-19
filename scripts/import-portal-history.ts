import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { parseHistoryMappings, parsePostedHistoryMarkdown } from '../src/lib/portal/history-import'

loadEnvConfig(process.cwd())

function argument(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? null : null
}

async function main() {
  const sourcePath = resolve(argument('--source')
    ?? '/Users/anastasiavolkova/Kanset/content/posted-history-import-2026-07.md')
  const mappingPath = argument('--mapping') ? resolve(argument('--mapping')!) : null
  const apply = process.argv.includes('--apply')
  const approvedChecksum = argument('--approved-checksum')
  const rawSource = await readFile(sourcePath, 'utf8')
  const sourceRows = parsePostedHistoryMarkdown(rawSource)
  if (!mappingPath) {
    console.log(JSON.stringify({ mode: 'dry-run', source: basename(sourcePath), rows: sourceRows.length,
      resolved: 0, unresolved: sourceRows.map((row) => ({ piece: row.piece,
        reason: 'explicit content_id/destination/timestamp mapping required' })) }, null, 2))
    if (apply) throw new Error('--apply requires --mapping and a reviewed --approved-checksum')
    return
  }
  const rawMapping = await readFile(mappingPath, 'utf8')
  const mappings = parseHistoryMappings(JSON.parse(rawMapping))
  const sourcePieces = new Set(sourceRows.map((row) => row.piece))
  for (const mapping of mappings) {
    if (!sourcePieces.has(mapping.piece)) throw new Error(`Mapping piece is absent from source timeline: ${mapping.piece}`)
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new Error('Missing Supabase service environment')
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: client, error: clientError } = await admin.from('clients').select('id').eq('slug','kanset').single()
  if (clientError || !client) throw new Error(`Kanset client unavailable: ${clientError?.message ?? 'missing'}`)
  const payload: Array<Record<string, unknown>> = []
  const unresolved: Array<{ piece: string; destination?: string; reason: string }> = []
  for (const mapping of mappings) {
    const { data: item, error: itemError } = await admin.from('content_with_state')
      .select('id,version').eq('client_id',client.id).eq('content_id',mapping.content_id).maybeSingle()
    if (itemError) throw new Error(itemError.message)
    if (!item) {
      unresolved.push({ piece: mapping.piece, reason: `released content_id not found: ${mapping.content_id}` })
      continue
    }
    for (const destination of mapping.destinations) {
      const { data: target, error: targetError } = await admin.from('content_publication_targets')
        .select('id').eq('client_id',client.id).eq('content_id',item.id).eq('content_version',item.version)
        .eq('destination',destination.destination).maybeSingle()
      if (targetError) throw new Error(targetError.message)
      if (!target) {
        unresolved.push({ piece: mapping.piece, destination: destination.destination,
          reason: 'exact released-version publication target not found' })
        continue
      }
      const stable = createHash('sha256').update(`${mapping.content_id}|${item.version}|${destination.destination}|${destination.published_at}`).digest('hex').slice(0,32)
      const legacy = destination.provenance === 'legacy_unverified'
      const evidenceKind = destination.provenance === 'yt_check' ? 'yt_check'
        : destination.provenance === 'public_url' ? 'reviewed_link' : 'agency_attestation'
      if (!legacy && !(destination.evidence_url ?? destination.live_url)) {
        unresolved.push({ piece: mapping.piece, destination: destination.destination,
          reason: 'verified historical provenance requires an evidence URL' })
        continue
      }
      payload.push({
        client_id: client.id, piece_label: mapping.piece, destination: destination.destination,
        provenance: destination.provenance, publication_target_id: target.id,
        published_at: new Date(destination.published_at).toISOString(),
        live_url: destination.live_url ?? null, visibility: destination.visibility ?? 'public',
        provider_object_id: destination.provider_object_id ?? null,
        evidence_kind: evidenceKind,
        evidence_url: legacy ? null : (destination.evidence_url ?? destination.live_url),
        attestation_note: legacy ? (destination.attestation_note
          ?? 'Agency attests this was posted before the portal; it was not independently verified.') : null,
        captured_at: new Date(destination.published_at).toISOString(),
        reconciliation_status: legacy ? 'unverified' : 'verified',
        verification_note: legacy ? 'Posted pre-portal; not independently verified.' : 'Historical public URL independently checked.',
        evidence_idempotency_key: `history-evidence-${stable}`,
        observation_key: `history-observation-${stable}`,
      })
    }
  }
  const missingSourceMappings = sourceRows.filter((row) => !mappings.some((mapping) => mapping.piece === row.piece))
  unresolved.push(...missingSourceMappings.map((row) => ({ piece: row.piece, reason: 'no reviewed mapping supplied' })))
  if (unresolved.length || payload.length === 0) {
    console.log(JSON.stringify({ mode: 'dry-run', source: basename(sourcePath), resolved: payload.length, unresolved }, null, 2))
    if (apply) throw new Error('Import refused: every source row and destination must resolve explicitly')
    return
  }
  const { data: preview, error: previewError } = await admin.rpc('preview_historical_publication_batch', {
    p_client_id: client.id, p_source_ref: basename(sourcePath), p_items: payload,
  })
  if (previewError) throw new Error(`Historical import preview rejected: ${previewError.message}`)
  console.log(JSON.stringify({ mode: apply ? 'apply-requested' : 'dry-run', preview }, null, 2))
  const serverChecksum = (preview as { approved_checksum?: string } | null)?.approved_checksum
  if (!apply) return
  if (!approvedChecksum || approvedChecksum !== serverChecksum) {
    throw new Error(`Apply refused: rerun after review with --approved-checksum ${serverChecksum}`)
  }
  const { data: batchId, error: applyError } = await admin.rpc('apply_historical_publication_batch', {
    p_client_id: client.id, p_source_ref: basename(sourcePath), p_items: payload,
    p_approved_checksum: approvedChecksum,
  })
  if (applyError) throw new Error(`Historical import failed atomically: ${applyError.message}`)
  console.log(JSON.stringify({ applied: true, batchId, checksum: serverChecksum, items: payload.length }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
