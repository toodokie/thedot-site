import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireAdminSession, assertSameOriginRequest } from '@/lib/admin-security'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { GOOGLE_CALENDAR_SCOPES, googleOAuthConfig, randomSecret, sha256 } from '@/lib/portal/google-calendar'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    await requireAdminSession()
    assertSameOriginRequest(request)
    const body = await request.json() as { clientId?: string; calendarId?: string }
    if (!body.clientId?.match(/^[0-9a-f-]{36}$/i) || !body.calendarId
      || body.calendarId.length > 1024 || /[\r\n\0]/.test(body.calendarId)) {
      return NextResponse.json({ error: 'A client and exact Google Calendar ID are required.' }, { status: 400 })
    }
    const admin = createSupabaseAdmin()
    const { data: client } = await admin.from('clients').select('id').eq('id', body.clientId).single()
    if (!client) return NextResponse.json({ error: 'Client not found.' }, { status: 404 })
    const state = randomSecret(32)
    const { error } = await admin.from('calendar_oauth_states').insert({
      client_id: body.clientId, state_hash: sha256(state), requested_calendar_id: body.calendarId,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    })
    if (error) throw new Error(error.message)
    const cookieStore = await cookies()
    cookieStore.set('portal_calendar_oauth_state', state, { httpOnly: true,
      secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600,
      path: '/api/admin/portal/calendar/oauth/callback' })
    const config = googleOAuthConfig()
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri,
      response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
      scope: GOOGLE_CALENDAR_SCOPES.join(' '), state }).toString()
    return NextResponse.json({ authorizationUrl: url.toString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Calendar authorization failed'
    const status = message === 'ADMIN_AUTH_REQUIRED' ? 401 : message === 'INVALID_ORIGIN' ? 403 : 400
    return NextResponse.json({ error: status === 400 ? message : 'Unauthorized' }, { status })
  }
}
