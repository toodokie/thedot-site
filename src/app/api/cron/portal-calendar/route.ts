import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { enqueueCalendarMaintenance, runCalendarWorker } from '@/lib/portal/google-calendar-worker'

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
  await enqueueCalendarMaintenance()
  return NextResponse.json(await runCalendarWorker(20))
}
