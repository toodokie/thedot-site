import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'node:fs/promises'
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

async function main() {
  const [command, inputPath, flag] = process.argv.slice(2)
  if (!command || !inputPath) throw new Error('usage: portal-write <recommendation|link|report|communication|external-decision|invoice|idea> <payload.json> [--dry-run]')
  const payload = JSON.parse(await readFile(inputPath, 'utf8')) as Payload
  const slug = requiredText(payload.clientSlug, 'clientSlug', 100)
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
  } else throw new Error(`unknown portal-write command: ${command}`)
  if (flag === '--dry-run') { console.log(`VALID ${command} for ${slug} (${idempotency})`); return }
  const { data: client, error: clientError } = await admin.from('clients').select('id').eq('slug', slug).single()
  if (clientError || !client) throw new Error(`client unavailable: ${clientError?.message ?? 'missing'}`)
  args.p_client_id=client.id
  if(externalContentId){
    const {data:item,error:itemError}=await admin.from('content_items').select('id,working_version')
      .eq('client_id',client.id).eq('content_id',externalContentId).single()
    if(itemError||!item) throw new Error(`content unavailable: ${itemError?.message ?? 'missing'}`)
    args.p_content_id=item.id; args.p_content_version=externalContentVersion ?? item.working_version
  }
  const { data,error }=await admin.rpc(rpc,args)
  if(error) throw new Error(`${rpc}: ${error.message}`)
  console.log(`OK ${command} ${String(data)}`)
}
main().catch((error)=>{ console.error(`FAILED: ${error?.message ?? error}`); process.exit(1) })
