import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { rateLimit, getClientIP } from '@/lib/rate-limit'
import {
  classifyInboundRisk,
  REDIRECT_MESSAGE,
} from '@/lib/portal/assistant-guardrails'
import {
  ASSISTANT_MODEL,
  loadAssistantContext,
  runAssistant,
  type AssistantUsage,
} from '@/lib/portal/assistant'

// The Client Work Assistant request path. Gate order is the design doc's, verbatim:
//   1. getClientSession (tenant identity; 401 without it)
//   2. portal_assistant_gate RPC, run AS THE TENANT: 'assistant' feature switch (fail-closed)
//      then portal_require_client_action(client_id, 'can_use_assistant')
//   3. per-tenant rate/cost budget (service-role portal_assistant_check_budget, fail-closed)
//   4. classifyInboundRisk prefilter: blatant immigration-advice asks refuse with
//      REDIRECT_MESSAGE and never reach the model
//   5. load tenant-safe context (RLS session + safeFields)
//   6. Claude (claude-opus-4-8, streaming, incremental outbound guard)
//   7. validateAssistantOutput / stop_reason refusal handling (inside runAssistant)
//   8. log assistant_usage (service-role RPC), every outcome
// Nothing here can flip the 'assistant' switch; with the switch off (its shipped state)
// step 2 fails closed and the route answers 404-style for everyone.

export const runtime = 'nodejs'

const MAX_QUESTION_CHARS = 2000

// Shown when the model's own answer failed the outbound guard. Distinct from
// REDIRECT_MESSAGE (which is about immigration advice); this one is a safe generic stop.
const WITHHELD_MESSAGE =
  "I can't share that answer. Please reach out to The Dot and we'll help you directly."

function questionHash(question: string): string {
  return createHash('sha256').update(question, 'utf8').digest('hex')
}

// Browsers always send Origin on cross-site POST; a present-but-foreign Origin is CSRF.
// An absent Origin means a non-browser caller, which still needs the session cookie.
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

type UsageDecision =
  | 'answered'
  | 'refused_prefilter'
  | 'refused_model'
  | 'rejected_output'
  | 'rate_limited'
  | 'error'

// Audit is best-effort AFTER the outcome: a logging failure must not turn a served
// answer into a 500, but it is loud in the server log.
async function logUsage(
  clientId: string,
  hash: string,
  decision: UsageDecision,
  usage?: AssistantUsage,
): Promise<void> {
  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin.rpc('portal_assistant_log_usage', {
      p_client_id: clientId,
      p_question_hash: hash,
      p_decision: decision,
      p_prompt_tokens: usage?.promptTokens ?? 0,
      p_completion_tokens: usage?.completionTokens ?? 0,
      p_cost_cents: usage?.costCents ?? 0,
      p_model: ASSISTANT_MODEL,
    })
    if (error) console.error('assistant usage log failed:', error.message)
  } catch (error) {
    console.error('assistant usage log failed:', error)
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
  }

  // Outer per-IP shell against hammering; the real per-tenant budget is the DB check below.
  const ip = getClientIP(request)
  const shell = rateLimit(`assistant:${ip}`, { limit: 30, window: 5 * 60 * 1000 })
  if (!shell.success) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  let question: unknown
  try {
    ;({ question } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  if (typeof question !== 'string' || !question.trim() || question.length > MAX_QUESTION_CHARS) {
    return NextResponse.json({ error: 'Please ask a question (2000 characters max).' }, { status: 400 })
  }
  const trimmed = question.trim()
  const hash = questionHash(trimmed)

  // Gate: 'assistant' switch (fail-closed) + can_use_assistant capability, checked in the
  // database under the tenant's own JWT. Any failure answers as "not available".
  const supabase = await createSupabaseServer()
  const gate = await supabase.rpc('portal_assistant_gate', { p_client_id: session.clientId })
  if (gate.error) {
    return NextResponse.json({ error: 'The assistant is not available.' }, { status: 404 })
  }

  // Per-tenant rate/cost budget (service-role, fail-closed: any anomaly rejects).
  try {
    const admin = createSupabaseAdmin()
    const budget = await admin.rpc('portal_assistant_check_budget', {
      p_client_id: session.clientId,
    })
    const allowed =
      !budget.error && (budget.data as { allowed?: boolean } | null)?.allowed === true
    if (!allowed) {
      await logUsage(session.clientId, hash, 'rate_limited')
      return NextResponse.json(
        { error: 'The assistant has reached its usage limit for now. Please try again later.' },
        { status: 429 },
      )
    }
  } catch (error) {
    console.error('assistant budget check failed:', error)
    return NextResponse.json(
      { error: 'The assistant is not available right now.' },
      { status: 503 },
    )
  }

  // Inbound prefilter: blatant case-specific immigration questions refuse without a model call.
  if (classifyInboundRisk(trimmed) === 'immigration_advice') {
    await logUsage(session.clientId, hash, 'refused_prefilter')
    return NextResponse.json({ refused: true, message: REDIRECT_MESSAGE })
  }

  // Load the tenant-safe context BEFORE streaming so failures surface as a clean JSON error.
  let context
  try {
    context = await loadAssistantContext(session.clientId)
  } catch (error) {
    console.error('assistant context load failed:', error)
    await logUsage(session.clientId, hash, 'error')
    return NextResponse.json(
      { error: 'Something went wrong loading your account data. Please try again.' },
      { status: 500 },
    )
  }

  // Stream the answer as SSE. Chunks are only forwarded after clearing the incremental
  // outbound guard inside runAssistant; a violation or model refusal replaces the visible
  // text with a safe message via a terminal "replace" event.
  const clientId = session.clientId
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }
      try {
        const outcome = await runAssistant({
          question: trimmed,
          context,
          onSafeChunk: (chunk) => send({ type: 'chunk', text: chunk }),
        })
        if (outcome.decision === 'answered') {
          send({ type: 'done' })
        } else if (outcome.decision === 'refused_model') {
          send({ type: 'replace', text: REDIRECT_MESSAGE })
          send({ type: 'done' })
        } else {
          send({ type: 'replace', text: WITHHELD_MESSAGE })
          send({ type: 'done' })
        }
        await logUsage(clientId, hash, outcome.decision, outcome.usage)
      } catch (error) {
        console.error('assistant model call failed:', error)
        send({ type: 'error', message: 'Something went wrong. Please try again.' })
        await logUsage(clientId, hash, 'error')
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
