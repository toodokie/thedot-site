import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'

// Scheduled assistant maintenance (service-only, CRON_SECRET-authorized, same pattern as
// the portal-calendar cron): finalize abandoned generation reservations (reserved cost
// preserved), purge expired report-this-answer feedback, and reconcile the safe knowledge
// index as the recovery net behind the in-transaction refresh triggers. Every operation
// is idempotent; running with the assistant switch off is safe and changes nothing
// client-visible. Registering the schedule (Vercel cron -> this path) is a human step.

export const runtime = 'nodejs'

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const value = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!secret || !value) return false
  const a = Buffer.from(secret), b = Buffer.from(value)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = createSupabaseAdmin()
  const [reaped, purged, reconciled] = await Promise.all([
    admin.rpc('portal_assistant_reap_reservations', { p_older_than_minutes: 30 }),
    admin.rpc('portal_assistant_purge_feedback'),
    admin.rpc('portal_assistant_reconcile_index'),
  ])
  const failures = [reaped.error, purged.error, reconciled.error].filter(Boolean)
  if (failures.length > 0) {
    console.error('assistant maintenance failures:', failures.map((error) => error?.message))
    return NextResponse.json(
      { error: 'partial failure', details: failures.map((error) => error?.message) },
      { status: 500 },
    )
  }
  return NextResponse.json({
    reapedReservations: reaped.data ?? 0,
    purgedFeedback: purged.data ?? 0,
    reconciledIndex: reconciled.data ?? null,
  })
}
