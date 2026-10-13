import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  assistantEvalFixtureIds,
  runAssistantEvaluation,
} from '@/lib/portal/assistant-eval-runner'

export const runtime = 'nodejs'
export const maxDuration = 300

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

function authorized(request: Request): boolean {
  const secret = process.env.PORTAL_ASSISTANT_EVAL_SECRET?.trim()
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const expected = Buffer.from(secret)
  const received = Buffer.from(value)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  return NextResponse.json({ fixtureIds: assistantEvalFixtureIds() }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  try {
    const payload = await request.json().catch(() => ({})) as { fixtureIds?: unknown }
    if (payload.fixtureIds !== undefined
        && (!Array.isArray(payload.fixtureIds)
          || payload.fixtureIds.some((id) => typeof id !== 'string'))) {
      return NextResponse.json(
        { error: 'fixtureIds must be an array of strings' },
        { status: 400, headers: NO_STORE },
      )
    }
    const transcript = await runAssistantEvaluation(payload.fixtureIds as string[] | undefined)
    return NextResponse.json(transcript, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Evaluation failed'
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE })
  }
}
