import { NextResponse } from 'next/server'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { enqueueCalendarMaintenance, runCalendarWorker } from '@/lib/portal/google-calendar-worker'

export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    await requireAdminSession(); assertSameOriginRequest(request)
    await enqueueCalendarMaintenance()
    return NextResponse.json(await runCalendarWorker(10))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar worker failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
