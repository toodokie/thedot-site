import { after, NextResponse } from 'next/server'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { runCalendarWorker } from '@/lib/portal/google-calendar-worker'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const channelId = request.headers.get('x-goog-channel-id') ?? ''
  const resourceId = request.headers.get('x-goog-resource-id') ?? ''
  const token = request.headers.get('x-goog-channel-token') ?? ''
  const state = request.headers.get('x-goog-resource-state') ?? ''
  const messageRaw = request.headers.get('x-goog-message-number') ?? ''
  if (!channelId || !resourceId || !token || !/^\d{1,19}$/.test(messageRaw)
    || !['sync','exists','not_exists'].includes(state)) return new NextResponse(null, { status: 404 })
  const admin = createSupabaseAdmin()
  const { data, error } = await admin.rpc('accept_calendar_webhook', {
    p_channel_id: channelId, p_resource_id: resourceId, p_channel_token: token,
    p_message_number: messageRaw, p_resource_state: state,
  })
  if (error || data !== true) return new NextResponse(null, { status: 404 })
  after(async () => { await runCalendarWorker(5) })
  return new NextResponse(null, { status: 204 })
}
