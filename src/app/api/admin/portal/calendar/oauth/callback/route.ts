import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { encryptCalendarRefreshToken } from '@/lib/portal/google-calendar-crypto'
import { exchangeGoogleCode, googleJson, portalOrigin, sha256 } from '@/lib/portal/google-calendar'

export const runtime = 'nodejs'

function adminRedirect(status: string) {
  return NextResponse.redirect(`${portalOrigin()}/admin/portal?calendar=${encodeURIComponent(status)}`, 303)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code'), state = url.searchParams.get('state')
  const cookieStore = await cookies()
  const cookieState = cookieStore.get('portal_calendar_oauth_state')?.value
  cookieStore.delete('portal_calendar_oauth_state')
  if (!code || !state || !cookieState || state !== cookieState) return adminRedirect('auth-error')
  const admin = createSupabaseAdmin()
  const { data: oauthState } = await admin.from('calendar_oauth_states').select('*')
    .eq('state_hash', sha256(state)).is('consumed_at', null).gt('expires_at', new Date().toISOString()).single()
  if (!oauthState) return adminRedirect('auth-expired')
  await admin.from('calendar_oauth_states').update({ consumed_at: new Date().toISOString() }).eq('id', oauthState.id)
  try {
    const token = await exchangeGoogleCode(code)
    if (!token.refresh_token) throw new Error('Google did not issue an offline refresh token; revoke access and reconnect')
    const [calendar, listEntry, user] = await Promise.all([
      googleJson<{ summary: string; timeZone?: string }>(token.access_token,
        `/calendars/${encodeURIComponent(oauthState.requested_calendar_id)}`),
      googleJson<{ accessRole: string }>(token.access_token,
        `/users/me/calendarList/${encodeURIComponent(oauthState.requested_calendar_id)}`),
      fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { authorization: `Bearer ${token.access_token}` }, cache: 'no-store',
      }).then(async (response) => {
        if (!response.ok) throw new Error('Google account identity unavailable')
        return response.json() as Promise<{ email?: string }>
      }),
    ])
    if (!['owner','writer'].includes(listEntry.accessRole)) throw new Error('The authorized account is not a calendar owner/writer')
    if (calendar.timeZone && calendar.timeZone !== 'America/Toronto') throw new Error('Kanset calendar timezone must be America/Toronto')
    if (!user.email) throw new Error('Google account email unavailable')
    const encrypted = encryptCalendarRefreshToken(token.refresh_token)
    const { data: credential, error: credentialError } = await admin.from('calendar_credentials').insert({
      client_id: oauthState.client_id, ciphertext: encrypted.ciphertext, iv: encrypted.iv,
      auth_tag: encrypted.authTag, key_version: encrypted.keyVersion,
    }).select('id').single()
    if (credentialError || !credential) throw new Error(credentialError?.message ?? 'Credential storage failed')
    const { data: existing } = await admin.from('calendar_integrations').select('id,client_id,credential_id')
      .eq('provider','google').eq('calendar_id', oauthState.requested_calendar_id).maybeSingle()
    let integrationId: string
    if (existing) {
      if (existing.client_id !== oauthState.client_id) throw new Error('Calendar is already assigned to another tenant')
      const { error } = await admin.from('calendar_integrations').update({
        credential_id: credential.id, display_name: calendar.summary, owner_email: user.email,
        access_role: listEntry.accessRole, status: 'active', updated_at: new Date().toISOString(),
      }).eq('id', existing.id).eq('client_id', oauthState.client_id)
      if (error) throw new Error(error.message)
      integrationId = existing.id
      await admin.from('calendar_credentials').delete().eq('id', existing.credential_id)
    } else {
      const { data: integration, error } = await admin.from('calendar_integrations').insert({
        client_id: oauthState.client_id, credential_id: credential.id,
        calendar_id: oauthState.requested_calendar_id, display_name: calendar.summary,
        owner_email: user.email, access_role: listEntry.accessRole,
      }).select('id').single()
      if (error || !integration) throw new Error(error?.message ?? 'Integration storage failed')
      integrationId = integration.id
    }
    await admin.from('calendar_sync_state').upsert({ integration_id: integrationId,
      client_id: oauthState.client_id, sync_token: null, health: 'setup_required',
      consecutive_failures: 0, updated_at: new Date().toISOString() }, { onConflict: 'integration_id' })
    for (const [jobType, key] of [['full','initial-full'],['renew_watch','initial-watch'],
      ['acl_check','initial-acl'],['reconcile','initial-reconcile']] as const) {
      await admin.from('calendar_sync_jobs').upsert({ integration_id: integrationId,
        client_id: oauthState.client_id, job_type: jobType, dedupe_key: key, payload: {},
      }, { onConflict: 'integration_id,dedupe_key', ignoreDuplicates: true })
    }
    return adminRedirect('connected')
  } catch {
    return adminRedirect('auth-error')
  }
}
