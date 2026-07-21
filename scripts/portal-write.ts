import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFile, writeFile } from 'node:fs/promises'
import { renderStatusGatesBlock } from '../src/lib/portal/gates'
import { loadAgencyStagePiece } from '../src/lib/portal/gates-loader'
import {
  assertClientSafeAgencyText, assertReportMetrics, assertReviewedHttpsUrl,
  optionalText, requiredText, sha256,
} from '../src/lib/portal/agency-write'

loadEnvConfig(process.cwd())
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase server environment')
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

type Payload = Record<string, unknown> & { clientSlug?: unknown; idempotencyKey?: unknown; actorKey?: unknown }
const stringArray = (value: unknown, field: string, allowed: string[]) => {
  const text = requiredText(value, field, 100)
  if (!allowed.includes(text)) throw new Error(`${field} is invalid`)
  return text
}
const integer = (value: unknown, field: string, min = 0) => {
  if (!Number.isInteger(value) || (value as number) < min) throw new Error(`${field} must be an integer >= ${min}`)
  return value as number
}
const timestamp = (value: unknown, field: string) => {
  const text = requiredText(value, field, 100)
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp`)
  return new Date(text).toISOString()
}
// Mirror of the DB's portal_note_grammar_safe (fix C): gate/completion notes render into
// the STATUS GATES markdown, so reject control chars/newlines and the reserved grammar
// delimiters (| @ and the '- [' checkbox) before the RPC does.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]')
const assertNoteGrammarSafe = (value: string | null, field: string) => {
  if (value === null) return
  if (CONTROL_CHARS.test(value) || value.includes('|') || value.includes('@') || value.includes('- ['))
    throw new Error(`${field} contains a reserved grammar or control character (newline, |, @, - [)`)
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2)
  if (!command || !inputPath) throw new Error('usage: portal-write <recommendation|link|report|communication|external-decision|invoice|idea|design-link|gate|ops-task|ops-task-complete> <payload.json> [--dry-run] [--pack <path>]')
  const dryRun = rest.includes('--dry-run')
  const packIndex = rest.indexOf('--pack')
  const packPath = packIndex >= 0 ? rest[packIndex + 1] ?? null : null
  const payload = JSON.parse(await readFile(inputPath, 'utf8')) as Payload
  // ops commands may be agency-global (no client); everything else requires the slug
  const slugOptional = (command === 'ops-task' && payload.clientSlug == null) || command === 'ops-task-complete'
  const slug = slugOptional ? null : requiredText(payload.clientSlug, 'clientSlug', 100)
  const actor = requiredText(payload.actorKey ?? 'thedot-admin', 'actorKey', 64)
  const idempotency = requiredText(payload.idempotencyKey, 'idempotencyKey', 200)
  let rpc: string; let args: Record<string, unknown>
  let externalContentId: string | null = null
  let externalContentVersion: number | null = null
  if (command === 'recommendation') {
    const title = requiredText(payload.title, 'title', 300); const body = requiredText(payload.body, 'body', 8000)
    assertClientSafeAgencyText({ title, body })
    rpc = 'upsert_portal_recommendation'; args = { p_client_id: null,
      p_source_key: requiredText(payload.sourceKey,'sourceKey',200), p_title:title,p_body:body,
      p_category:stringArray(payload.category,'category',['content','platform','growth','copy']),
      p_platform:optionalText(payload.platform,'platform',100),
      p_source_type:stringArray(payload.sourceType,'sourceType',['strategy_review','performance_review','client_request','historical_import']),
      p_source_ref:requiredText(payload.sourceRef,'sourceRef',500),
      p_provenance:payload.provenance ?? {}, p_status:stringArray(payload.status ?? 'active','status',['active','archived']),
      p_actor_key:actor,p_idempotency_key:idempotency }
  } else if (command === 'link') {
    const label=requiredText(payload.label,'label',300); const description=optionalText(payload.description,'description',2000)
    assertClientSafeAgencyText({ label,description })
    rpc='upsert_portal_link'; args={p_client_id:null,p_link_key:requiredText(payload.linkKey,'linkKey',200),
      p_category:stringArray(payload.category,'category',['brand','video','posting']),p_label:label,
      p_url:assertReviewedHttpsUrl(payload.url),p_description:description,p_sort:integer(payload.sort ?? 0,'sort'),
      p_source_type:stringArray(payload.sourceType ?? 'agency_curated','sourceType',['agency_curated','historical_import']),
      p_source_ref:requiredText(payload.sourceRef,'sourceRef',500),p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'report') {
    const metrics=assertReportMetrics(payload.metrics); const summary=optionalText(payload.summary,'summary',4000)
    assertClientSafeAgencyText({summary})
    rpc='upsert_portal_report_snapshot'; args={p_client_id:null,p_period_start:requiredText(payload.periodStart,'periodStart',10),
      p_period_end:requiredText(payload.periodEnd,'periodEnd',10),p_platform:stringArray(payload.platform,'platform',['instagram','facebook','youtube','website']),
      p_schema_version:integer(payload.schemaVersion ?? 1,'schemaVersion',1),p_metrics:metrics,p_summary:summary,
      p_collected_at:timestamp(payload.collectedAt,'collectedAt'),p_source_type:stringArray(payload.sourceType,'sourceType',['platform_export','platform_ui','manual_calculation']),
      p_source_ref:requiredText(payload.sourceRef,'sourceRef',500),p_source_checksum:requiredText(payload.sourceChecksum ?? sha256(metrics),'sourceChecksum',64),
      p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'communication') {
    const title=requiredText(payload.title,'title',300); const summary=requiredText(payload.summary,'summary',4000)
    const clientActorName=requiredText(payload.clientActorName,'clientActorName',200)
    assertClientSafeAgencyText({title,summary,clientActorName})
    rpc='log_portal_communication'; args={p_client_id:null,p_communication_key:requiredText(payload.communicationKey,'communicationKey',200),
      p_channel:stringArray(payload.channel,'channel',['email','call','meeting']),p_occurred_at:timestamp(payload.occurredAt,'occurredAt'),
      p_title:title,p_summary:summary,p_actor_name:clientActorName,
      p_source_ref:requiredText(payload.sourceRef,'sourceRef',500),p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'external-decision') {
    const note=optionalText(payload.note,'note',2000); assertClientSafeAgencyText({note})
    externalContentId=requiredText(payload.contentId,'contentId',200)
    externalContentVersion=payload.contentVersion === undefined ? null : integer(payload.contentVersion,'contentVersion',1)
    rpc='record_external_decision'; args={p_client_id:null,p_content_id:null,p_content_version:externalContentVersion,
      p_contact_auth_user_id:requiredText(payload.contactAuthUserId,'contactAuthUserId',36),
      p_decision:stringArray(payload.decision,'decision',['approved','change_requested']),p_note:note,
      p_decision_source:stringArray(payload.decisionSource,'decisionSource',['email','call']),
      p_source_occurred_at:timestamp(payload.sourceOccurredAt,'sourceOccurredAt'),p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'invoice') {
    // Mirror upsert_invoice's server validation locally so --dry-run cannot approve a payload the
    // RPC would reject. Financial fields are immutable after issuance; notes is agency-only.
    const amount = payload.amount
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount >= 100000000)
      throw new Error('amount must be a positive number below 100000000')
    const number = requiredText(payload.number, 'number', 64)
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/.test(number)) throw new Error('invalid invoice number format')
    const isDate = (v: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
      const [year, month, day] = v.split('-').map(Number)
      if (year < 1 || month < 1 || month > 12 || day < 1) return false
      const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
      const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
      return day <= days[month - 1]
    }
    const issuedAt = requiredText(payload.issuedAt, 'issuedAt', 10)
    if (!isDate(issuedAt)) throw new Error('issuedAt must be a YYYY-MM-DD date')
    const maxIssued = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    if (issuedAt > maxIssued) throw new Error('issuedAt cannot be more than one day in the future')
    const periodStart = optionalText(payload.periodStart, 'periodStart', 10)
    const periodEnd = optionalText(payload.periodEnd, 'periodEnd', 10)
    if ((periodStart === null) !== (periodEnd === null)) throw new Error('period start and end must be provided together')
    if (periodStart && periodEnd) {
      if (!isDate(periodStart) || !isDate(periodEnd)) throw new Error('period dates must be YYYY-MM-DD')
      if (periodEnd < periodStart) throw new Error('period end precedes start')
    }
    const currency = (optionalText(payload.currency, 'currency', 3) ?? 'CAD').toUpperCase()
    if (currency !== 'CAD') throw new Error('currency must be CAD')
    const documentUrl = optionalText(payload.documentUrl, 'documentUrl', 2048)
    if (documentUrl !== null
      && !/^https:\/\/(docs|drive)\.google\.com\/[^\s\u0000-\u001F\u007F-\u009F]+$/u.test(documentUrl))
      throw new Error('documentUrl must be an agency Google Doc/Drive https link')
    rpc = 'upsert_invoice'; args = { p_client_id: null,
      p_number: number, p_issued_at: issuedAt, p_period_start: periodStart, p_period_end: periodEnd,
      p_amount: amount, p_currency: currency, p_document_url: documentUrl,
      p_notes: optionalText(payload.notes, 'notes', 4000),
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'design-link') {
    // Item-level design links (set_content_design_links, migration 0020): presentation
    // metadata outside the sealed version checksum. FULL overwrite semantics: both
    // fields must be present in the payload (null clears the item-level override), so
    // an omitted field can never silently wipe an existing link by accident.
    if (!('canvaUrl' in payload) || !('driveUrl' in payload)) {
      throw new Error('design-link payload must carry BOTH canvaUrl and driveUrl (null to clear)')
    }
    const canvaUrl = payload.canvaUrl === null ? null : requiredText(payload.canvaUrl, 'canvaUrl', 2048)
    const driveUrl = payload.driveUrl === null ? null : requiredText(payload.driveUrl, 'driveUrl', 2048)
    const hostOf = (url: string) => new URL(url).hostname.toLowerCase()
    if (canvaUrl !== null
      && (!/^https:\/\//.test(canvaUrl) || !['canva.com', 'www.canva.com'].includes(hostOf(canvaUrl))))
      throw new Error('canvaUrl must be an https canva.com/www.canva.com link')
    if (driveUrl !== null
      && (!/^https:\/\//.test(driveUrl) || hostOf(driveUrl) !== 'drive.google.com'))
      throw new Error('driveUrl must be an https drive.google.com link')
    rpc = 'set_content_design_links'; args = { p_client_id: null,
      p_content_id: requiredText(payload.contentId, 'contentId', 200),
      p_canva_url: canvaUrl, p_drive_url: driveUrl,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'idea') {
    // Audited agency idea entry (agency_add_idea, migration 0019). authorType records
    // WHOSE idea it is (Maria's emailed ideas stay hers); the receipt + activity trail
    // records that the agency entered it. The client-side add_idea path is unchanged.
    const title = requiredText(payload.title, 'title', 300)
    const body = optionalText(payload.body, 'body', 4000)
    const authorName = requiredText(payload.authorName, 'authorName', 200)
    assertClientSafeAgencyText({ title, body, authorName })
    rpc = 'agency_add_idea'; args = { p_client_id: null,
      p_title: title, p_body: body,
      p_status: stringArray(payload.status ?? 'new', 'status', ['new','considering','planned','archived']),
      p_author_type: stringArray(payload.authorType ?? 'client', 'authorType', ['client','anastasia','agent']),
      p_author_name: authorName,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'gate') {
    // Production-gate emission (set_production_gate, migration 0022). Accepts the
    // grammar's hyphenated keys or the DB's underscored ones. Notes are agency-only
    // provenance (never client-facing), so no client-safe text gate here.
    const gateKey = requiredText(payload.gateKey, 'gateKey', 40).replaceAll('-', '_')
    const state = stringArray(payload.state, 'state', ['open', 'done', 'na'])
    if (state === 'na' && !payload.naReason) throw new Error('na requires naReason (the [~] rule)')
    if (state === 'done' && !payload.occurredAt) throw new Error('done requires occurredAt (every [x] carries a date)')
    const gateNote = optionalText(payload.note, 'note', 2000)
    const naReason = optionalText(payload.naReason, 'naReason', 1000)
    assertNoteGrammarSafe(gateNote, 'note')
    assertNoteGrammarSafe(naReason, 'naReason')
    rpc = 'set_production_gate'; args = { p_client_id: null,
      p_content_id: requiredText(payload.contentId, 'contentId', 200),
      p_gate_key: stringArray(gateKey, 'gateKey', ['source_in_hand', 'design_built', 'proofed', 'approval_sent']),
      p_state: state,
      p_owner: stringArray(payload.owner ?? 'anastasia', 'owner', ['anastasia', 'studio', 'agent']),
      p_note: gateNote,
      p_na_reason: naReason,
      p_occurred_at: payload.occurredAt == null ? null : timestamp(payload.occurredAt, 'occurredAt'),
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'ops-task') {
    rpc = 'add_ops_task'; args = { p_client_id: null,
      p_title: requiredText(payload.title, 'title', 300),
      p_category: stringArray(payload.category, 'category',
        ['invoice', 'follow_up', 'revisit', 'access', 'watch', 'plan', 'report', 'portal', 'admin']),
      p_due_date: payload.dueDate == null ? null : requiredText(payload.dueDate, 'dueDate', 10),
      p_trigger_note: optionalText(payload.triggerNote, 'triggerNote', 1000),
      p_owner: stringArray(payload.owner ?? 'anastasia', 'owner', ['anastasia', 'studio', 'agent']),
      p_source: requiredText(payload.source, 'source', 1000),
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'ops-task-complete') {
    const completionNote = optionalText(payload.note, 'note', 1000)
    assertNoteGrammarSafe(completionNote, 'note')
    rpc = 'complete_ops_task'; args = {
      p_task_id: requiredText(payload.taskId, 'taskId', 40),
      p_status: stringArray(payload.status ?? 'done', 'status', ['done', 'dropped']),
      p_note: completionNote,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else throw new Error(`unknown portal-write command: ${command}`)
  if (dryRun) { console.log(`VALID ${command} for ${slug ?? 'agency'} (${idempotency})`); return }
  let clientId: string | null = null
  if (slug) {
    const { data: client, error: clientError } = await admin.from('clients').select('id').eq('slug', slug).single()
    if (clientError || !client) throw new Error(`client unavailable: ${clientError?.message ?? 'missing'}`)
    clientId = client.id
    if ('p_client_id' in args) args.p_client_id = clientId
  }
  if(externalContentId){
    const {data:item,error:itemError}=await admin.from('content_items').select('id,working_version')
      .eq('client_id',clientId).eq('content_id',externalContentId).single()
    if(itemError||!item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    args.p_content_id=item.id; args.p_content_version=externalContentVersion ?? item.working_version
  }
  const { data,error }=await admin.rpc(rpc,args)
  if(error) throw new Error(`${rpc}: ${error.message}`)
  console.log(`OK ${command} ${String(data)}`)
  if (command === 'gate' && clientId) {
    await emitStatusGatesBlock(clientId, String(args.p_content_id), packPath)
  }
}

// After a gate emission, regenerate the piece's STATUS GATES block from the portal's
// full truth (production gates from 0022 + fact-check/decision/schedule/publication
// from their real homes). Loads over content_items + the WORKING version (Codex round-2
// BLOCKER 1), so an UNRELEASED draft/idea piece regenerates too, not just released ones.
// With --pack <path> the block is patched into the pack (best-effort mirror: the file is
// the OUTPUT of the write); without it the block is PRINTED so the mirror can never
// silently diverge without a visible step.
async function emitStatusGatesBlock(clientId: string, contentId: string, packPath: string | null) {
  let piece
  try {
    piece = await loadAgencyStagePiece(admin, clientId, contentId)
  } catch (error) {
    console.warn(`WARN: gate block data unavailable: ${(error as Error).message}`)
    return
  }
  if (!piece) { console.warn(`WARN: no working snapshot for ${contentId}; block not regenerated`); return }
  const block = renderStatusGatesBlock(piece, new Date().toISOString())
  if (packPath) {
    const result = await patchPackBlock(packPath, piece.contentId, block)
    if (result.patched) { console.log(`PACK UPDATED: ${packPath}`); return }
    console.warn(result.reason === 'ambiguous'
      ? `WARN: multiple STATUS GATES blocks in ${packPath} match this content_id (duplicate exact or shared normalized suffix); refusing to guess which. Paste this:`
      : 'WARN: no matching STATUS GATES block found in the pack; paste this:')
  } else {
    console.log('Regenerated STATUS GATES block (paste into the piece pack; or rerun with --pack <path>):')
  }
  console.log(block)
}

// Strip the client + date prefix so a pack block written under an old id form still
// matches; used only as the fallback when there is no exact content_id match.
function normalizeGateId(id: string): string {
  return id.replace(/^kanset-/, '').replace(/^\d{4}-\d{2}(-\d{2})?-/, '')
}

type PatchResult = { patched: true } | { patched: false; reason: 'not_found' | 'ambiguous' }

// Patch the ONE block for this content_id. An EXACT id match wins outright (post-cutover
// blocks carry the bare content_id), UNLESS two blocks carry the same exact id, which is
// as ambiguous as a shared normalized suffix and refuses (Codex round-4 fix 1). Only when
// there is no exact match do we fall back to the date/client-stripped normalized suffix,
// and if TWO blocks share that suffix we REFUSE too. A wrong-block patch is a silent data
// error. The pack's own header line is preserved (packs suffix it, e.g. "(decoder reel)").
async function patchPackBlock(packPath: string, contentId: string, block: string): Promise<PatchResult> {
  let source: string
  try { source = await readFile(packPath, 'utf8') } catch { return { patched: false, reason: 'not_found' } }
  const pattern = /(## STATUS GATES[^\n]*\n)<!-- gates: id=([^ ]+) date=[^>]*-->\n((?:- \[[^\]]\][^\n]*\n?)*)/g
  const matches = [...source.matchAll(pattern)].map((m) => ({
    full: m[0], header: m[1], id: m[2], index: m.index ?? 0,
  }))
  const target = normalizeGateId(contentId)
  const exact = matches.filter((m) => m.id === contentId)
  let chosen: (typeof matches)[number] | undefined
  if (exact.length > 1) {
    return { patched: false, reason: 'ambiguous' } // duplicate exact ids: refuse, don't guess
  } else if (exact.length === 1) {
    chosen = exact[0]
  } else {
    const normalized = matches.filter((m) => normalizeGateId(m.id) === target)
    if (normalized.length > 1) return { patched: false, reason: 'ambiguous' }
    chosen = normalized[0]
  }
  if (!chosen) return { patched: false, reason: 'not_found' }
  const [, ...generated] = block.split('\n') // drop the generic header, keep the pack's
  const replacement = chosen.header + generated.join('\n') + '\n'
  const output = source.slice(0, chosen.index) + replacement + source.slice(chosen.index + chosen.full.length)
  await writeFile(packPath, output, 'utf8')
  return { patched: true }
}
main().catch((error)=>{ console.error(`FAILED: ${error?.message ?? error}`); process.exit(1) })
