import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { runPreviewRetention } from '@/lib/portal/review-preview-retention'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret), b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Nightly sweep (spec 7): retires previews whose piece is live everywhere, archived or superseded,
// or whose planned date is more than 7 days past, then deletes the queued objects. Publication
// confirmations already purge their own piece; this catches everything else.
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await runPreviewRetention(createSupabaseAdmin(), { now: new Date() }))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Preview retention failed' },
      { status: 500 },
    )
  }
}
