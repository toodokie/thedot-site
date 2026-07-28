import { NextRequest, NextResponse } from 'next/server'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { rateLimit, getClientIP } from '@/lib/rate-limit'
import {
  classifyAssistantRequest,
  REDIRECT_MESSAGE,
  PII_MESSAGE,
  NO_GROUNDING_MESSAGE,
  NO_WEB_GROUNDING_MESSAGE,
  WITHHELD_MESSAGE,
  ASSISTANT_PROMPT_VERSION,
  isPerformanceReportQuestion,
  isUpcomingContentQuestion,
  reportPlatformFromQuestion,
} from '@/lib/portal/assistant-guardrails'
import {
  ASSISTANT_MODEL,
  hmacHex,
  deriveSafetyIdentifier,
  moderationBlocks,
  runPortalMode,
  runPublicMode,
  type GatewayUsage,
  type RetrievedChunk,
  type TranscriptTurn,
} from '@/lib/portal/assistant'

// The Client Work Assistant request path (spec 5.6, steps 1-11):
//   1. same-origin + IP shell + session (tenant identity)
//   2. portal_assistant_gate RPC AS THE TENANT: 'assistant' switch (fail-closed, shipped
//      OFF) then can_use_assistant capability
//   3. length-check the question + page-memory transcript; local PII detection; mode
//      classification; case_specific and PII-bearing requests refuse with a FIXED message
//      before any search or model call
//   4. input moderation (stop on refusal; a moderation transport failure also stops)
//   5. portal_workspace: tenant-scoped safe search RPC; empty retrieval returns the fixed
//      no-grounding result WITHOUT any OpenAI call
//   6. ATOMIC budget reservation (service role, fail closed) immediately before each
//      generation; the OpenAI call runs only against a reserved run row
//   7. per-mode isolated OpenAI Responses calls (portal: no tools, strict schema; public:
//      web_search only, official domains) with server-side validation of every citation
//   8. output moderation on the buffered validated text (never streamed unvalidated)
//   9. settle the reservation with actual usage; if accounting cannot be recorded the
//      answer is WITHHELD (durable accounting is part of "served")
//  10. mixed questions run 5-9 twice, isolated, and render separate sections
// Raw questions/answers are never persisted; telemetry is HMAC + ids + outcome only.

export const runtime = 'nodejs'

const MAX_QUESTION_CHARS = 2000
const MAX_TRANSCRIPT_ENTRIES = 40

// Personalized tenant data: never cacheable, and cache keys must vary by cookie.
const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, no-transform',
  Vary: 'Cookie',
} as const

function json(payload: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(payload, { status, headers: PRIVATE_HEADERS })
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const allowed = new Set<string>([new URL(request.url).origin])
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin)
    } catch {
      // ignore a malformed configured URL; the request-origin check still applies
    }
  }
  return allowed.has(origin)
}

type RunMode = 'portal_workspace' | 'public_immigration_research' | 'refused_case_specific'
type SafetyOutcome =
  | 'answered'
  | 'no_grounding'
  | 'case_specific_refusal'
  | 'moderation_refusal'
  | 'source_validation_failed'
  | 'error'

// Non-generation telemetry (refusals, moderation stops, grounding misses without a model
// call, pre-reservation errors). Best-effort: these rows carry no spend, so a logging
// failure must not turn a safe fixed response into an outage, but it is loud.
async function logRun(options: {
  clientId: string
  userId: string
  mode: RunMode
  queryHmac: string
  outcome: SafetyOutcome
}): Promise<void> {
  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.rpc('portal_assistant_log_run', {
      p_client_id: options.clientId,
      p_auth_user_id: options.userId,
      p_mode: options.mode,
      p_query_hmac: options.queryHmac,
      p_retrieved_chunk_ids: [],
      p_citation_chunk_ids: [],
      p_citation_urls: [],
      p_safety_outcome: options.outcome,
      p_model: ASSISTANT_MODEL,
      p_prompt_version: ASSISTANT_PROMPT_VERSION,
      p_input_tokens: 0,
      p_output_tokens: 0,
      p_cost_cents: 0,
      p_latency_ms: 0,
    })
    if (error) console.error('assistant run log failed:', error.message)
  } catch (error) {
    console.error('assistant run log failed:', error)
  }
}

// Atomic reservation (spec caps + Codex atomicity finding). Throws never; returns null
// when the request may not generate, with a client-safe denial payload.
async function reserveRun(options: {
  clientId: string
  userId: string
  mode: RunMode
  queryHmac: string
}): Promise<{ runId: string } | { denial: NextResponse }> {
  try {
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.rpc('portal_assistant_reserve_run', {
      p_client_id: options.clientId,
      p_auth_user_id: options.userId,
      p_mode: options.mode,
      p_query_hmac: options.queryHmac,
      p_model: ASSISTANT_MODEL,
      p_prompt_version: ASSISTANT_PROMPT_VERSION,
    })
    const result = data as {
      allowed?: boolean
      reason?: string
      run_id?: string
      soft_alert?: boolean
    } | null
    if (error || !result) {
      console.error('assistant reserve failed:', error?.message ?? 'no data')
      return { denial: json({ error: 'The assistant is not available right now.' }, 503) }
    }
    if (result.soft_alert) {
      // monitored soft alert: the monthly OpenAI budget passed $15 (hard stop at $25)
      console.error('ASSISTANT BUDGET SOFT ALERT: monthly OpenAI spend passed the soft threshold')
    }
    if (result.allowed !== true || !result.run_id) {
      const reason = result.reason ?? 'not_allowed'
      if (reason === 'monthly_budget_hard_stop') {
        return {
          denial: json({
            error: 'The assistant has reached its monthly usage budget. Please reach out to The Dot directly.',
          }, 429),
        }
      }
      if (reason === 'user_daily_limit' || reason === 'tenant_daily_limit') {
        return {
          denial: json({
            error: 'The assistant has reached its daily usage limit. Please try again tomorrow.',
          }, 429),
        }
      }
      return { denial: json({ error: 'The assistant is not available.' }, 404) }
    }
    return { runId: result.run_id }
  } catch (error) {
    console.error('assistant reserve failed:', error)
    return { denial: json({ error: 'The assistant is not available right now.' }, 503) }
  }
}

// Durable settlement. Returns false when accounting could not be recorded, in which case
// the caller MUST withhold the answer (Codex: served requires recorded accounting).
async function settleRun(options: {
  runId: string
  outcome: SafetyOutcome
  retrievedChunkIds: string[]
  citationChunkIds: string[]
  citationUrls: string[]
  usage: GatewayUsage
}): Promise<boolean> {
  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.rpc('portal_assistant_settle_run', {
      p_run_id: options.runId,
      p_safety_outcome: options.outcome,
      p_retrieved_chunk_ids: options.retrievedChunkIds,
      p_citation_chunk_ids: options.citationChunkIds,
      p_citation_urls: options.citationUrls,
      p_input_tokens: options.usage.inputTokens,
      p_output_tokens: options.usage.outputTokens,
      p_cost_cents: options.usage.costCents,
      p_latency_ms: options.usage.latencyMs,
    })
    if (error) {
      console.error('assistant settle failed:', error.message)
      return false
    }
    return true
  } catch (error) {
    console.error('assistant settle failed:', error)
    return false
  }
}

// ---- response shapes rendered by the chat UI --------------------------------

type PortalCitation = { chunkId: string; title: string; route: string }
type PortalSection = {
  kind: 'portal'
  runId: string
  blocks: Array<{ text: string; citations: PortalCitation[] }>
  suggestedRoutes: Array<{ route: string; title: string }>
}
type WebSection = {
  kind: 'web'
  runId: string
  text: string
  citations: Array<{ url: string; title: string; startIndex: number; endIndex: number }>
}
type Section = PortalSection | WebSection

type TranscriptInput = TranscriptTurn[]

function parseTranscript(raw: unknown): TranscriptInput {
  if (!Array.isArray(raw)) return []
  const turns: TranscriptInput = []
  for (const entry of raw.slice(-MAX_TRANSCRIPT_ENTRIES)) {
    if (typeof entry !== 'object' || entry === null) continue
    const candidate = entry as Record<string, unknown>
    if (candidate.role !== 'user' && candidate.role !== 'assistant') continue
    if (typeof candidate.text !== 'string') continue
    turns.push({ role: candidate.role, text: candidate.text })
  }
  return turns
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOrigin(request)) {
    return json({ error: 'Forbidden.' }, 403)
  }

  // Outer per-IP shell against hammering; the real caps are the atomic DB reservation.
  const ip = getClientIP(request)
  const shell = rateLimit(`assistant:${ip}`, { limit: 30, window: 5 * 60 * 1000 })
  if (!shell.success) {
    return json({ error: 'Too many requests.' }, 429)
  }

  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) {
    return json({ error: 'Not signed in.' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  // Gate: 'assistant' switch (fail-closed) + can_use_assistant, checked in the database
  // under the tenant's own JWT. Any failure answers as "not available".
  const supabase = await createSupabaseServer()
  const gate = await supabase.rpc('portal_assistant_gate', { p_client_id: session.clientId })
  if (gate.error) {
    return json({ error: 'The assistant is not available.' }, 404)
  }

  // ---- "report this answer" (monitored feedback path, same gate) ------------
  if (body.report === true) {
    const runId = typeof body.runId === 'string' ? body.runId : ''
    const category = typeof body.category === 'string' ? body.category : ''
    const comment = typeof body.comment === 'string' ? body.comment.slice(0, 2000) : null
    const feedback = await supabase.rpc('portal_assistant_report_answer', {
      p_client_id: session.clientId,
      p_run_id: runId,
      p_category: category,
      p_comment: comment,
    })
    if (feedback.error) {
      return json({ error: 'Could not record the report. Please try again.' }, 400)
    }
    return json({ reported: true })
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > MAX_QUESTION_CHARS) {
    return json({ error: 'Please ask a question (2000 characters max).' }, 400)
  }
  const transcript = parseTranscript(body.transcript)
  const queryHmac = hmacHex(question)
  const clientId = session.clientId
  const userId = session.userId
  const safetyIdentifier = deriveSafetyIdentifier(userId)

  // Step 2/3: local classification + PII detection. Fixed refusals, no model call.
  const classification = classifyAssistantRequest(question)
  if (classification.mode === 'case_specific') {
    await logRun({
      clientId, userId, mode: 'refused_case_specific', queryHmac,
      outcome: 'case_specific_refusal',
    })
    return json({
      refused: true,
      message: classification.pii.length > 0 ? PII_MESSAGE : REDIRECT_MESSAGE,
    })
  }

  // Step 3: input moderation, fail closed (a moderation failure stops the request).
  try {
    if (await moderationBlocks(question)) {
      await logRun({
        clientId, userId,
        mode: classification.mode === 'public_immigration_research'
          ? 'public_immigration_research' : 'portal_workspace',
        queryHmac, outcome: 'moderation_refusal',
      })
      return json({ refused: true, message: WITHHELD_MESSAGE })
    }
  } catch (error) {
    console.error('assistant input moderation failed:', error)
    return json({ error: 'The assistant is not available right now.' }, 503)
  }

  const sections: Section[] = []
  const notices: string[] = []

  // ---- portal path ----------------------------------------------------------
  if (classification.mode === 'portal_workspace' || classification.mode === 'mixed') {
    let chunks: RetrievedChunk[]
    if (isUpcomingContentQuestion(question)) {
      // Chronology is not a keyword-search problem. Read the same client-visible weekly
      // plan used by the Plan surface, under the caller's own JWT and RLS, then preserve
      // its date + position order for the model. Only the client-facing planning snapshot
      // enters the prompt.
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Toronto',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
      const cycle = await supabase
        .from('plan_cycles_client')
        .select('id,title,week_start,week_end,revision')
        .eq('client_id', clientId)
        .gte('week_end', today)
        .order('week_start', { ascending: true })
        .order('revision', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (cycle.error) {
        console.error('assistant upcoming-plan lookup failed:', cycle.error.message)
        await logRun({ clientId, userId, mode: 'portal_workspace', queryHmac, outcome: 'error' })
        return json({ error: 'Something went wrong. Please try again.' }, 500)
      }
      const cycleData = cycle.data
      if (!cycleData) {
        chunks = []
      } else {
        const items = await supabase
          .from('plan_cycle_items_client')
          .select('id,content_id,position,planned_date,title,format,platforms,direction_note')
          .eq('client_id', clientId)
          .eq('plan_cycle_id', cycleData.id)
          .gte('planned_date', today)
          .order('planned_date', { ascending: true })
          .order('position', { ascending: true })
          .limit(8)
        if (items.error) {
          console.error('assistant upcoming-plan items lookup failed:', items.error.message)
          await logRun({ clientId, userId, mode: 'portal_workspace', queryHmac, outcome: 'error' })
          return json({ error: 'Something went wrong. Please try again.' }, 500)
        }
        chunks = (items.data ?? []).map((item) => {
          const fields = [
            `Upcoming plan item: ${item.title}`,
            `Plan: ${cycleData.title}`,
            `Next plan order: position ${item.position}`,
            item.planned_date ? `Planned date: ${item.planned_date}` : null,
            item.format ? `Format: ${item.format}` : null,
            Array.isArray(item.platforms) && item.platforms.length > 0
              ? `Platforms: ${item.platforms.join(', ')}`
              : null,
            item.direction_note ? `Direction: ${item.direction_note}` : null,
          ].filter((field): field is string => field !== null)
          return {
            chunk_id: item.id,
            document_id: cycleData.id,
            source_type: 'plan_item',
            title: item.title,
            related_route: `plan/${item.content_id}`,
            answer_eligibility: 'navigation_only',
            excerpt: fields.join('. ').slice(0, 700) + '.',
            rank: 1000 - item.position,
          }
        })
      }
    } else if (isPerformanceReportQuestion(question)) {
      // "IG performance" is a report lookup, not a literal keyword search. Read the same
      // schema-v1 client-visible snapshots as the Reports page under the caller's JWT/RLS,
      // then keep only the latest snapshot for the requested platform (or each platform).
      const platform = reportPlatformFromQuestion(question)
      let reportQuery = supabase
        .from('report_snapshots')
        .select('id,period,period_start,period_end,platform,summary,metrics,updated_at')
        .eq('client_id', clientId)
        .gte('schema_version', 1)
        .order('period_start', { ascending: false })
        .order('updated_at', { ascending: false })
      if (platform) reportQuery = reportQuery.eq('platform', platform)
      const reports = await reportQuery.limit(platform ? 1 : 16)
      if (reports.error) {
        console.error('assistant performance-report lookup failed:', reports.error.message)
        await logRun({ clientId, userId, mode: 'portal_workspace', queryHmac, outcome: 'error' })
        return json({ error: 'Something went wrong. Please try again.' }, 500)
      }

      const latest = platform
        ? (reports.data ?? []).slice(0, 1)
        : (reports.data ?? []).filter((row, index, rows) =>
            rows.findIndex((candidate) => candidate.platform === row.platform) === index)
      chunks = latest.map((row, index) => {
        const summary = typeof row.summary === 'string' ? row.summary : ''
        const metrics = row.metrics && typeof row.metrics === 'object'
          ? JSON.stringify(row.metrics)
          : '{}'
        const excerpt = [
          `Latest ${row.platform} performance report`,
          `Period: ${row.period_start} to ${row.period_end}`,
          summary ? `Summary: ${summary}` : null,
          `Metrics: ${metrics}`,
        ].filter((field): field is string => field !== null).join('. ')
        return {
          chunk_id: row.id,
          document_id: row.id,
          source_type: 'report',
          title: `Performance report ${row.period} (${row.platform})`,
          related_route: 'reports',
          answer_eligibility: 'grounded_answer',
          excerpt: excerpt.slice(0, 700),
          rank: 1000 - index,
        }
      })
    } else {
      // General tenant-scoped safe retrieval under the caller's own JWT.
      const search = await supabase.rpc('portal_assistant_search', {
        p_client_id: clientId,
        p_query: question,
      })
      if (search.error) {
        console.error('assistant search failed:', search.error.message)
        await logRun({ clientId, userId, mode: 'portal_workspace', queryHmac, outcome: 'error' })
        return json({ error: 'Something went wrong. Please try again.' }, 500)
      }
      chunks = (search.data ?? []) as RetrievedChunk[]
    }

    if (chunks.length === 0) {
      // fixed no-grounding result WITHOUT an OpenAI generation (spec step 4)
      await logRun({
        clientId, userId, mode: 'portal_workspace', queryHmac, outcome: 'no_grounding',
      })
      notices.push(NO_GROUNDING_MESSAGE)
    } else {
      const reserved = await reserveRun({
        clientId, userId, mode: 'portal_workspace', queryHmac,
      })
      if ('denial' in reserved) return reserved.denial

      let outcome: SafetyOutcome = 'error'
      let usage: GatewayUsage = { inputTokens: 0, outputTokens: 0, costCents: 0, latencyMs: 0 }
      let citationChunkIds: string[] = []
      let section: PortalSection | null = null
      try {
        const result = await runPortalMode({ question, transcript, chunks, safetyIdentifier })
        usage = result.usage
        if (result.kind === 'answered') {
          const combined = result.answer.blocks.map((block) => block.text).join('\n')
          if (await moderationBlocks(combined)) {
            outcome = 'moderation_refusal'
          } else {
            outcome = 'answered'
            citationChunkIds = result.answer.blocks.flatMap((block) => block.citation_chunk_ids)
            const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]))
            const byRoute = new Map(chunks.map((chunk) => [chunk.related_route, chunk]))
            section = {
              kind: 'portal',
              runId: reserved.runId,
              blocks: result.answer.blocks.map((block) => ({
                text: block.text,
                citations: block.citation_chunk_ids.map((id) => ({
                  chunkId: id,
                  title: byId.get(id)?.title ?? 'Portal item',
                  route: byId.get(id)?.related_route ?? '',
                })),
              })),
              suggestedRoutes: result.answer.suggested_routes.map((route) => ({
                route,
                title: byRoute.get(route)?.title ?? route,
              })),
            }
          }
        } else if (result.kind === 'no_grounding') {
          outcome = 'no_grounding'
        } else {
          outcome = 'source_validation_failed'
          console.error('assistant portal output rejected:', result.reason)
        }
      } catch (error) {
        console.error('assistant portal generation failed:', error)
        outcome = 'error'
      }

      const settled = await settleRun({
        runId: reserved.runId,
        outcome,
        retrievedChunkIds: chunks.map((chunk) => chunk.chunk_id),
        citationChunkIds,
        citationUrls: [],
        usage,
      })
      if (!settled) {
        // durable accounting is part of "served": withhold rather than serve unrecorded
        return json({ refused: true, message: WITHHELD_MESSAGE })
      }
      if (outcome === 'answered' && section) sections.push(section)
      else if (outcome === 'no_grounding') notices.push(NO_GROUNDING_MESSAGE)
      else if (outcome === 'moderation_refusal') notices.push(WITHHELD_MESSAGE)
      else notices.push(WITHHELD_MESSAGE)
    }
  }

  // ---- public official-source path (isolated request, never portal data) ----
  if (classification.mode === 'public_immigration_research' || classification.mode === 'mixed') {
    const reserved = await reserveRun({
      clientId, userId, mode: 'public_immigration_research', queryHmac,
    })
    if ('denial' in reserved) {
      // in mixed mode a portal section may already exist; render it with a notice
      if (sections.length > 0) {
        notices.push('Public immigration information is unavailable right now.')
      } else {
        return reserved.denial
      }
    } else {
      let outcome: SafetyOutcome = 'error'
      let usage: GatewayUsage = { inputTokens: 0, outputTokens: 0, costCents: 0, latencyMs: 0 }
      let citationUrls: string[] = []
      let section: WebSection | null = null
      try {
        const result = await runPublicMode({ question, safetyIdentifier })
        usage = result.usage
        if (result.kind === 'answered') {
          if (await moderationBlocks(result.text)) {
            outcome = 'moderation_refusal'
          } else {
            outcome = 'answered'
            citationUrls = [...new Set(result.citations.map((citation) => citation.url))]
            section = {
              kind: 'web',
              runId: reserved.runId,
              text: result.text,
              citations: result.citations,
            }
          }
        } else if (result.kind === 'no_grounding') {
          outcome = 'no_grounding'
        } else {
          outcome = 'source_validation_failed'
          console.error('assistant web output rejected:', result.reason)
        }
      } catch (error) {
        console.error('assistant web generation failed:', error)
        outcome = 'error'
      }

      const settled = await settleRun({
        runId: reserved.runId,
        outcome,
        retrievedChunkIds: [],
        citationChunkIds: [],
        citationUrls,
        usage,
      })
      if (!settled) {
        return json({ refused: true, message: WITHHELD_MESSAGE })
      }
      if (outcome === 'answered' && section) sections.push(section)
      else if (outcome === 'no_grounding') notices.push(NO_WEB_GROUNDING_MESSAGE)
      else notices.push(WITHHELD_MESSAGE)
    }
  }

  if (sections.length === 0 && notices.length === 0) {
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
  return json({ sections, notices })
}
