import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFile, writeFile } from 'node:fs/promises'
import { renderStatusGatesBlock } from '../src/lib/portal/gates'
import { loadAgencyStagePiece } from '../src/lib/portal/gates-loader'
import { patchStatusGatesBlock } from '../src/lib/portal/status-gates-pack'
import {
  assertClientSafeAgencyText, assertReportMetrics, assertReviewedHttpsUrl,
  optionalText, requiredText, sha256,
} from '../src/lib/portal/agency-write'
import { parseProposalBlocks } from '../src/lib/portal/proposals'
import { buildReportNotificationCopy } from '../src/lib/portal/report-email'

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
const calendarDate = (value: unknown, field: string) => {
  const text = requiredText(value, field, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${field} must be a YYYY-MM-DD date`)
  const [year, month, day] = text.split('-').map(Number)
  const dt = new Date(Date.UTC(year, month - 1, day))
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day)
    throw new Error(`${field} must be a real calendar date`)
  return text
}
// Mirror of the DB's portal_note_grammar_safe (fix C): gate/completion notes render into
// the STATUS GATES markdown, so reject control chars/newlines and the reserved grammar
// delimiters (| @ and the '- [' checkbox) before the RPC does.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F]')
const assertNoteGrammarSafe = (value: string | null, field: string) => {
  if (value === null) return
  if (CONTROL_CHARS.test(value) || value.includes('|') || value.includes('@') || value.includes('- ['))
    throw new Error(`${field} contains a reserved grammar or control character (newline, |, @, - [)`)
}

async function main() {
  const [command, inputPath, ...rest] = process.argv.slice(2)
  if (!command || !inputPath) throw new Error('usage: portal-write <recommendation|link|report|report-notify|communication|proposal-draft|proposal-revise|proposal-submit|proposal-reply|external-decision|courtesy-release|override-destination|schedule-confirm|publication-confirm|invoice|idea|news-idea|idea-status|design-link|plan-cycle|plan-cycle-stage|plan-cycle-close|plan-cycle-decision|plan-date|gate|status-gates|ops-task|ops-task-complete> <payload.json> [--dry-run] [--pack <path>]')
  const dryRun = rest.includes('--dry-run')
  const packIndex = rest.indexOf('--pack')
  const packPath = packIndex >= 0 ? rest[packIndex + 1] ?? null : null
  const payload = JSON.parse(await readFile(inputPath, 'utf8')) as Payload
  // ops commands may be agency-global (no client); everything else requires the slug
  const slugOptional = (command === 'ops-task' && payload.clientSlug == null)
    || command === 'ops-task-complete' || command === 'idea-status'
  const slug = slugOptional ? null : requiredText(payload.clientSlug, 'clientSlug', 100)
  const actor = requiredText(payload.actorKey ?? 'thedot-admin', 'actorKey', 64)
  // status-gates only regenerates the local canonical pack from the portal's already
  // committed state. It invokes no writer, so a command receipt would be misleading.
  const idempotency = command === 'status-gates' ? '' : requiredText(payload.idempotencyKey, 'idempotencyKey', 200)
  let rpc: string; let args: Record<string, unknown>
  let externalContentId: string | null = null
  let externalContentVersion: number | null = null
  let publication: {
    contentId: string
    contentVersion: number
    destination: string
    liveUrl: string
    publishedAt: string
    capturedAt: string
    evidenceKind: string
    observedTitle: string | null
    verificationNote: string | null
  } | null = null
  let scheduleConfirmation: {
    contentId: string
    contentVersion: number
    destination: string
    scheduledAt: string
    externalUrl: string | null
    externalId: string | null
  } | null = null
  let statusGatesContentId: string | null = null
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
  } else if (command === 'report-notify') {
    const reportKey = requiredText(payload.reportKey, 'reportKey', 100)
    if (!/^[a-z0-9][a-z0-9-]*$/.test(reportKey)) {
      throw new Error('reportKey must use lowercase letters, numbers, and hyphens')
    }
    const periodLabel = requiredText(payload.periodLabel, 'periodLabel', 80)
    const recipientName = requiredText(payload.recipientName, 'recipientName', 80)
    const reportUrl = assertReviewedHttpsUrl(payload.reportUrl)
    const copy = buildReportNotificationCopy({ periodLabel, recipientName })
    assertClientSafeAgencyText({ title: copy.subject, body: copy.bodyText })
    rpc = 'notify_portal_report_ready'; args = {
      p_client_id: null,
      p_report_key: reportKey,
      p_period_label: periodLabel,
      p_recipient_name: recipientName,
      p_subject: copy.subject,
      p_body: copy.bodyText,
      p_report_url: reportUrl,
      p_actor_key: actor,
      p_idempotency_key: idempotency,
    }
  } else if (command === 'communication') {
    const title=requiredText(payload.title,'title',300); const summary=requiredText(payload.summary,'summary',4000)
    const clientActorName=requiredText(payload.clientActorName,'clientActorName',200)
    assertClientSafeAgencyText({title,summary,clientActorName})
    rpc='log_portal_communication'; args={p_client_id:null,p_communication_key:requiredText(payload.communicationKey,'communicationKey',200),
      p_channel:stringArray(payload.channel,'channel',['email','call','meeting','text']),p_occurred_at:timestamp(payload.occurredAt,'occurredAt'),
      p_title:title,p_summary:summary,p_actor_name:clientActorName,
      p_source_ref:requiredText(payload.sourceRef,'sourceRef',500),p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'proposal-draft') {
    const proposalKey = requiredText(payload.proposalKey, 'proposalKey', 200)
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(proposalKey)) throw new Error('proposalKey must be lowercase letters, numbers, dots, underscores, or hyphens')
    const title = requiredText(payload.title, 'title', 300); const summary = optionalText(payload.summary, 'summary', 2000)
    const blocks = parseProposalBlocks(payload.blocks)
    const safe: Record<string, string | null> = { title, summary }
    for (const [index, block] of blocks.entries()) {
      safe[`block_${index}_title`] = block.title ?? null; safe[`block_${index}_body`] = block.body ?? null
      for (const [itemIndex, item] of (block.items ?? []).entries()) safe[`block_${index}_item_${itemIndex}`] = item
      for (const [linkIndex, link] of (block.links ?? []).entries()) {
        safe[`block_${index}_link_${linkIndex}`] = link.label; assertReviewedHttpsUrl(link.url)
      }
    }
    assertClientSafeAgencyText(safe)
    rpc = 'upsert_client_proposal_draft'; args = { p_client_id: null, p_proposal_key: proposalKey, p_title: title,
      p_summary: summary, p_blocks: blocks, p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'proposal-submit') {
    const proposalKey = requiredText(payload.proposalKey, 'proposalKey', 200)
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(proposalKey)) throw new Error('proposalKey is invalid')
    rpc = 'submit_client_proposal'; args = { p_client_id: null, p_proposal_key: proposalKey,
      p_revision: integer(payload.revision, 'revision', 1), p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'proposal-revise') {
    const proposalKey = requiredText(payload.proposalKey, 'proposalKey', 200)
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(proposalKey)) throw new Error('proposalKey is invalid')
    rpc = 'revise_client_proposal_draft'; args = { p_client_id: null, p_proposal_key: proposalKey,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'proposal-reply') {
    const proposalId = requiredText(payload.proposalId, 'proposalId', 36)
    if (!/^[0-9a-f-]{36}$/i.test(proposalId)) throw new Error('proposalId is invalid')
    const body = requiredText(payload.body, 'body', 4000); assertClientSafeAgencyText({ body })
    rpc = 'reply_to_client_proposal'; args = { p_proposal_id: proposalId, p_body: body, p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'external-decision') {
    const note=optionalText(payload.note,'note',2000); assertClientSafeAgencyText({note})
    externalContentId=requiredText(payload.contentId,'contentId',200)
    externalContentVersion=payload.contentVersion === undefined ? null : integer(payload.contentVersion,'contentVersion',1)
    rpc='record_external_decision'; args={p_client_id:null,p_content_id:null,p_content_version:externalContentVersion,
      p_contact_auth_user_id:requiredText(payload.contactAuthUserId,'contactAuthUserId',36),
      p_decision:stringArray(payload.decision,'decision',['approved','change_requested']),p_note:note,
      p_decision_source:stringArray(payload.decisionSource,'decisionSource',['email','call']),
      p_source_occurred_at:timestamp(payload.sourceOccurredAt,'sourceOccurredAt'),p_actor_key:actor,p_idempotency_key:idempotency}
  } else if (command === 'courtesy-release') {
    // A courtesy release is an explicit agency policy for this exact released snapshot.
    // It is deliberately NOT an external/client approval and must never be used to
    // impersonate a Maria decision. The DB re-checks release completeness,
    // current-version identity, agency_mutations, and the absence of any decision.
    // The Dot-produced content additionally requires the client-safe reason prefix
    // "Agency override authorized by Anastasia:" so the exception is explicit in audit.
    const reason = requiredText(payload.reason, 'reason', 2000)
    assertClientSafeAgencyText({ reason })
    if (reason.length < 10) throw new Error('reason must be at least 10 characters')
    externalContentId = requiredText(payload.contentId, 'contentId', 200)
    externalContentVersion = integer(payload.contentVersion, 'contentVersion', 1)
    rpc = 'record_content_courtesy_release'; args = {
      p_content_id: null, p_content_version: externalContentVersion, p_reason: reason,
      p_actor_key: actor, p_idempotency_key: idempotency,
    }
  } else if (command === 'override-destination') {
    const reason = requiredText(payload.reason, 'reason', 2000)
    assertClientSafeAgencyText({ reason })
    externalContentId = requiredText(payload.contentId, 'contentId', 200)
    externalContentVersion = integer(payload.contentVersion, 'contentVersion', 1)
    rpc = 'add_content_agency_override_destination'; args = {
      p_content_id: null, p_content_version: externalContentVersion,
      p_destination: stringArray(payload.destination, 'destination',
        ['instagram', 'facebook', 'youtube', 'squarespace']),
      p_reason: reason, p_actor_key: actor, p_idempotency_key: idempotency,
    }
  } else if (command === 'publication-confirm') {
    const liveUrl = assertReviewedHttpsUrl(payload.liveUrl)
    const observedTitle = optionalText(payload.observedTitle, 'observedTitle', 300)
    const verificationNote = optionalText(payload.verificationNote, 'verificationNote', 2000)
    assertClientSafeAgencyText({ observedTitle, verificationNote })
    publication = {
      contentId: requiredText(payload.contentId, 'contentId', 200),
      contentVersion: integer(payload.contentVersion, 'contentVersion', 1),
      destination: stringArray(payload.destination, 'destination',
        ['instagram', 'facebook', 'youtube', 'squarespace']),
      liveUrl,
      publishedAt: timestamp(payload.publishedAt, 'publishedAt'),
      capturedAt: timestamp(payload.capturedAt ?? new Date().toISOString(), 'capturedAt'),
      evidenceKind: stringArray(payload.evidenceKind ?? 'reviewed_link', 'evidenceKind',
        ['reviewed_link', 'yt_check']),
      observedTitle,
      verificationNote,
    }
    if (publication.publishedAt > new Date().toISOString())
      throw new Error('publishedAt cannot be in the future')
    if (publication.capturedAt > new Date().toISOString())
      throw new Error('capturedAt cannot be in the future')
    rpc = 'record_publication_observation'
    args = {}
  } else if (command === 'schedule-confirm') {
    const externalUrl = payload.externalUrl == null ? null : assertReviewedHttpsUrl(payload.externalUrl)
    const externalId = optionalText(payload.externalId, 'externalId', 500)
    if (externalId !== null && !/^[A-Za-z0-9._:-]+$/.test(externalId)) {
      throw new Error('externalId contains unsupported characters')
    }
    scheduleConfirmation = {
      contentId: requiredText(payload.contentId, 'contentId', 200),
      contentVersion: integer(payload.contentVersion, 'contentVersion', 1),
      destination: stringArray(payload.destination, 'destination',
        ['instagram', 'facebook', 'youtube', 'squarespace']),
      scheduledAt: timestamp(payload.scheduledAt, 'scheduledAt'),
      externalUrl,
      externalId,
    }
    rpc = 'confirm_schedule_target'
    args = {}
  } else if (command === 'status-gates') {
    if (!packPath) throw new Error('status-gates requires --pack <canonical-piece-pack.md>')
    statusGatesContentId = requiredText(payload.contentId, 'contentId', 200)
    rpc = 'status-gates'
    args = {}
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
      p_status: stringArray(payload.status ?? 'proposed', 'status',
        ['proposed','picked','dropped','new','considering','planned','archived']),
      p_author_type: stringArray(payload.authorType ?? 'client', 'authorType', ['client','anastasia','agent']),
      p_author_name: authorName,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'news-idea') {
    const title = requiredText(payload.title, 'title', 300)
    const body = optionalText(payload.body, 'body', 4000)
    const sourceRef = requiredText(payload.sourceRef, 'sourceRef', 2048)
    if (!/^https:\/\/[^\s\u0000-\u001F\u007F-\u009F]+$/u.test(sourceRef)
      || /^https:\/\/[^/?#]*@/u.test(sourceRef)) {
      throw new Error('sourceRef must be an https URL without credentials or control characters')
    }
    const authorName = requiredText(payload.authorName ?? 'Kanset news monitor', 'authorName', 200)
    assertClientSafeAgencyText({ title, body, authorName })
    rpc = 'agency_add_news_idea'; args = { p_client_id: null,
      p_title: title, p_body: body, p_source_ref: sourceRef, p_author_name: authorName,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'idea-status') {
    const becameContentId = payload.becameContentId == null
      ? null : requiredText(payload.becameContentId, 'becameContentId', 200)
    rpc = 'set_idea_status'; args = {
      p_idea_id: requiredText(payload.ideaId, 'ideaId', 36),
      p_status: stringArray(payload.status, 'status', ['proposed','picked','dropped','became_piece']),
      p_became_content_id: becameContentId,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'plan-cycle' || command === 'plan-cycle-stage') {
    const cycleKey = requiredText(payload.cycleKey, 'cycleKey', 200)
    const weekStart = requiredText(payload.weekStart, 'weekStart', 10)
    const weekEnd = requiredText(payload.weekEnd, 'weekEnd', 10)
    const isDate = (value: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
      const [y, m, d] = value.split('-').map(Number)
      const dt = new Date(Date.UTC(y, m - 1, d))
      return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
    }
    if (!isDate(weekStart) || !isDate(weekEnd) || weekEnd < weekStart)
      throw new Error('weekStart/weekEnd must be valid ordered YYYY-MM-DD dates')
    const title = requiredText(payload.title, 'title', 300)
    const directionSummary = requiredText(payload.directionSummary, 'directionSummary', 4000)
    assertClientSafeAgencyText({ title, directionSummary })
    if (!Array.isArray(payload.items) || payload.items.length < 1 || payload.items.length > 31)
      throw new Error('items must be a non-empty array with at most 31 entries')
    const items = payload.items.map((raw, index) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`items[${index}] must be an object`)
      const item = raw as Record<string, unknown>
      const contentId = requiredText(item.contentId, `items[${index}].contentId`, 200)
      const itemTitle = requiredText(item.title, `items[${index}].title`, 300)
      const format = optionalText(item.format, `items[${index}].format`, 100)
      const pillar = optionalText(item.pillar, `items[${index}].pillar`, 100)
      const producer = optionalText(item.producer, `items[${index}].producer`, 30)
      if (producer !== null && !['the_dot', 'studio'].includes(producer)) throw new Error(`items[${index}].producer is invalid`)
      const plannedDate = optionalText(item.plannedDate, `items[${index}].plannedDate`, 10)
      if (plannedDate !== null && !isDate(plannedDate)) throw new Error(`items[${index}].plannedDate is invalid`)
      const directionNote = optionalText(item.directionNote, `items[${index}].directionNote`, 2000)
      const platforms = item.platforms == null ? [] : item.platforms
      if (!Array.isArray(platforms) || platforms.length > 12 || platforms.some((p) => typeof p !== 'string' || p.length > 50))
        throw new Error(`items[${index}].platforms is invalid`)
      assertClientSafeAgencyText({ itemTitle, format, pillar, directionNote })
      return { content_id: contentId, title: itemTitle, format, pillar, producer,
        planned_date: plannedDate, direction_note: directionNote, platforms, position: index + 1 }
    })
    rpc = command === 'plan-cycle' ? 'agency_upsert_plan_cycle' : 'agency_stage_plan_cycle'; args = { p_client_id: null,
      p_cycle_key: cycleKey, p_week_start: weekStart, p_week_end: weekEnd,
      p_title: title, p_direction_summary: directionSummary, p_items: items,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'plan-cycle-close') {
    const reason = requiredText(payload.reason, 'reason', 500)
    if (reason.length < 3) throw new Error('reason must be at least 3 characters')
    assertClientSafeAgencyText({ reason })
    rpc = 'agency_close_plan_cycle'; args = { p_client_id: null,
      p_plan_cycle_id: requiredText(payload.planCycleId, 'planCycleId', 36),
      p_revision: integer(payload.revision, 'revision', 1), p_reason: reason,
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'plan-cycle-decision') {
    // Agency-recorded plan-cycle decision (0039). Records a real client approval/change made
    // out of band (email/call) so idea approval can be cleared agency-side. Attributed to the
    // client decider (contactAuthUserId); service-role only; gated on agency_mutations.
    const note = optionalText(payload.note, 'note', 2000)
    assertClientSafeAgencyText({ note })
    rpc = 'agency_record_plan_cycle_decision'; args = { p_client_id: null,
      p_plan_cycle_id: requiredText(payload.planCycleId, 'planCycleId', 36),
      p_revision: integer(payload.revision, 'revision', 1),
      p_contact_auth_user_id: requiredText(payload.contactAuthUserId, 'contactAuthUserId', 36),
      p_decision: stringArray(payload.decision, 'decision', ['approved', 'change_requested']),
      p_note: note,
      p_decision_source: stringArray(payload.decisionSource, 'decisionSource', ['email', 'call']),
      p_source_occurred_at: timestamp(payload.sourceOccurredAt, 'sourceOccurredAt'),
      p_actor_key: actor, p_idempotency_key: idempotency }
  } else if (command === 'plan-date') {
    if (!('plannedDate' in payload)) throw new Error('plan-date requires plannedDate (use null to unschedule)')
    const plannedDate = payload.plannedDate === null ? null : calendarDate(payload.plannedDate, 'plannedDate')
    const note = optionalText(payload.note, 'note', 2000)
    assertClientSafeAgencyText({ note })
    rpc = 'agency_set_content_plan_date'; args = { p_client_id: null,
      p_content_id: requiredText(payload.contentId, 'contentId', 200),
      p_planned_date: plannedDate, p_note: note,
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
  if (statusGatesContentId) {
    if (!clientId) throw new Error('status-gates requires a client')
    await emitStatusGatesBlock(clientId, statusGatesContentId, packPath)
    return
  }
  if(externalContentId){
    const {data:item,error:itemError}=await admin.from('content_items').select('id,working_version')
      .eq('client_id',clientId).eq('content_id',externalContentId).single()
    if(itemError||!item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    args.p_content_id=item.id; args.p_content_version=externalContentVersion ?? item.working_version
  }
  if (publication) {
    if (!clientId) throw new Error('publication confirmation requires a client')
    const { data: item, error: itemError } = await admin.from('content_items')
      .select('id').eq('client_id', clientId).eq('content_id', publication.contentId).single()
    if (itemError || !item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    const { data: target, error: targetError } = await admin.from('content_publication_targets')
      .select('id,current_observation_id').eq('client_id', clientId).eq('content_id', item.id)
      .eq('content_version', publication.contentVersion)
      .eq('destination', publication.destination).single()
    if (targetError || !target)
      throw new Error(`publication target unavailable: ${targetError?.message ?? 'missing'}`)
    const evidenceKey = `${idempotency}:evidence`
    if (evidenceKey.length > 128) throw new Error('idempotencyKey is too long for publication evidence')
    const { data: evidenceId, error: evidenceError } = await admin.rpc('register_publication_evidence', {
      p_client_id: clientId,
      p_actor_key: actor,
      p_evidence_kind: publication.evidenceKind,
      p_object_key: null,
      p_evidence_url: publication.liveUrl,
      p_attestation_note: null,
      p_captured_at: publication.capturedAt,
      p_sha256: null,
      p_mime_type: null,
      p_byte_length: null,
      p_idempotency_key: evidenceKey,
    })
    if (evidenceError || !evidenceId)
      throw new Error(`register_publication_evidence: ${evidenceError?.message ?? 'missing evidence id'}`)
    // A command may have committed successfully even when its caller lost the response.
    // Reusing the observation key must therefore verify and return the durable row, not
    // pass that row back as its own superseded predecessor (which changes the DB
    // fingerprint and turns an exact retry into observation_key_conflict).
    const { data: existing, error: existingError } = await admin
      .from('content_publication_observations')
      .select('id,publication_target_id,provider_state,published_at,permalink,visibility,evidence_id,source_type,reconciliation_status,observed_title')
      .eq('client_id', clientId).eq('observation_key', idempotency).maybeSingle()
    if (existingError) throw new Error(`publication retry lookup: ${existingError.message}`)
    if (existing) {
      const same = existing.publication_target_id === target.id
        && existing.provider_state === 'live'
        && new Date(existing.published_at).toISOString() === publication.publishedAt
        && existing.permalink === publication.liveUrl
        && existing.visibility === 'public'
        && existing.evidence_id === evidenceId
        && existing.source_type === 'manual'
        && existing.reconciliation_status === 'verified'
        && (existing.observed_title ?? null) === publication.observedTitle
      if (!same) throw new Error('publication observation key already belongs to different data')
      console.log(`OK publication-confirm ${existing.id} (existing)`)
      return
    }
    args = {
      p_publication_target_id: target.id,
      p_provider_state: 'live',
      p_live_url: publication.liveUrl,
      p_published_at: publication.publishedAt,
      p_visibility: 'public',
      p_evidence_id: evidenceId,
      p_actor_key: actor,
      p_source_type: 'manual',
      p_reconciliation_status: 'verified',
      p_provider_object_id: null,
      p_observed_title: publication.observedTitle,
      p_observed_text: null,
      p_observation_key: idempotency,
      p_supersedes_observation_id: target.current_observation_id,
      p_verification_note: publication.verificationNote,
    }
  }
  if (scheduleConfirmation) {
    if (!clientId) throw new Error('schedule confirmation requires a client')
    const { data: item, error: itemError } = await admin.from('content_items')
      .select('id,status,client_visible_version,revision_in_progress')
      .eq('client_id', clientId).eq('content_id', scheduleConfirmation.contentId).single()
    if (itemError || !item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    // Targets are created by the approved-decision writer. Do not create them here:
    // that would let a CLI user turn an unapproved release into a scheduled promise.
    if (item.status !== 'approved' && item.status !== 'scheduled') {
      throw new Error('schedule target unavailable: record the real copy approval before confirming a schedule')
    }
    if (item.revision_in_progress || item.client_visible_version !== scheduleConfirmation.contentVersion) {
      throw new Error('schedule target unavailable: requested version is not the current approved release')
    }
    const { data: target, error: targetError } = await admin.from('content_schedule_targets')
      .select('id').eq('client_id', clientId).eq('content_id', item.id)
      .eq('content_version', scheduleConfirmation.contentVersion)
      .eq('destination', scheduleConfirmation.destination).maybeSingle()
    if (targetError) throw new Error(`schedule target lookup: ${targetError.message}`)
    if (!target) {
      throw new Error('schedule target unavailable: approved content has no target for this destination')
    }
    args = {
      p_schedule_target_id: target.id,
      p_scheduled_at: scheduleConfirmation.scheduledAt,
      p_external_url: scheduleConfirmation.externalUrl,
      p_external_id: scheduleConfirmation.externalId,
      p_evidence_id: null,
      p_actor_key: actor,
      p_idempotency_key: idempotency,
    }
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
// Patch the ONE block for this content_id. An EXACT id match wins outright (post-cutover
// blocks carry the bare content_id), UNLESS two blocks carry the same exact id, which is
// as ambiguous as a shared normalized suffix and refuses (Codex round-4 fix 1). Only when
// there is no exact match do we fall back to the date/client-stripped normalized suffix,
// and if TWO blocks share that suffix we REFUSE too. A wrong-block patch is a silent data
// error. The pack's own header line is preserved (packs suffix it, e.g. "(decoder reel)").
async function patchPackBlock(packPath: string, contentId: string, block: string) {
  let source: string
  try { source = await readFile(packPath, 'utf8') } catch { return { patched: false, reason: 'not_found' } }
  const result = patchStatusGatesBlock(source, contentId, block)
  if (!result.patched) return result
  await writeFile(packPath, result.output, 'utf8')
  return { patched: true }
}
main().catch((error)=>{ console.error(`FAILED: ${error?.message ?? error}`); process.exit(1) })
