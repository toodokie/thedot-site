import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// Hourly (vercel.json). Turns plan 3's live unsent-draft alert into one agency inbox event per
// seat, piece and Toronto day (migration 0095). Idempotent; writes no activity and sends no email.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' } as const

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret), b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
  try {
    const { data, error } = await createSupabaseAdmin().rpc('agency_raise_unsent_draft_alert_events', { p_now: null })
    if (error) throw new Error(error.message)
    return NextResponse.json({ raised: typeof data === 'number' ? data : 0 }, { headers: NO_STORE })
  } catch (error) {
    console.error('unsent draft alerts failed:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: 'failed' }, { status: 500, headers: NO_STORE })
  }
}
