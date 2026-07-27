import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { drainPortalNotifications } from '@/lib/portal/notification-worker'

export const runtime = 'nodejs'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret)
  const b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  }
  try {
    const result = await drainPortalNotifications(createSupabaseAdmin(), {
      worker: `vercel-notifications-${process.env.VERCEL_REGION ?? 'unknown'}`,
    })
    if (result.skipped) {
      // A cron invocation that cannot deliver must not look successful. The rows remain
      // pending for the next run, but the 503 makes missing deployment configuration visible
      // in Vercel's cron logs/health checks.
      return NextResponse.json(
        { error: 'notification delivery is not configured' },
        { status: 503, headers: NO_STORE },
      )
    }
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('portal notification maintenance failed:', message)
    return NextResponse.json({ error: 'notification delivery failed' }, { status: 500, headers: NO_STORE })
  }
}
