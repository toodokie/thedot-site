import 'server-only'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createSupabaseAdmin } from '@/lib/supabase/admin'
import { decryptCalendarRefreshToken, type EncryptedCredential } from './google-calendar-crypto'
export { googleEventStart, safeEditorialEvent, stableEditorialKey } from './google-calendar-values'
export type { GoogleEvent } from './google-calendar-values'

export const GOOGLE_CALENDAR_SCOPES = [
  'openid', 'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.acls.readonly',
]

type Integration = {
  id: string; client_id: string; credential_id: string; calendar_id: string
  display_name: string; timezone: string; status: string
}

export class GoogleCalendarError extends Error {
  constructor(message: string, readonly status: number, readonly body = '') { super(message) }
}

export function portalOrigin(): string {
  const value = process.env.PORTAL_PUBLIC_ORIGIN ?? process.env.NEXT_PUBLIC_SITE_URL
  if (!value) throw new Error('PORTAL_PUBLIC_ORIGIN is not configured')
  const url = new URL(value)
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) {
    throw new Error('PORTAL_PUBLIC_ORIGIN must be HTTPS')
  }
  return url.origin
}

export function googleOAuthConfig() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Google Calendar OAuth is not configured')
  return { clientId, clientSecret, redirectUri: `${portalOrigin()}/api/admin/portal/calendar/oauth/callback` }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function randomSecret(bytes = 32): string { return randomBytes(bytes).toString('base64url') }

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) throw new GoogleCalendarError(`Google Calendar request failed (${response.status})`, response.status, text.slice(0, 1000))
  return text ? JSON.parse(text) as T : ({} as T)
}

export async function exchangeGoogleCode(code: string) {
  const config = googleOAuthConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: config.clientId, client_secret: config.clientSecret,
      redirect_uri: config.redirectUri, grant_type: 'authorization_code' }), cache: 'no-store',
  })
  return parseGoogleResponse<{ access_token: string; refresh_token?: string; expires_in: number; scope: string }>(response)
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const config = googleOAuthConfig()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: config.clientId,
      client_secret: config.clientSecret, grant_type: 'refresh_token' }), cache: 'no-store',
  })
  const result = await parseGoogleResponse<{ access_token: string }>(response)
  return result.access_token
}

export async function googleJson<T>(accessToken: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init, cache: 'no-store', headers: { authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers },
  })
  return parseGoogleResponse<T>(response)
}

export async function accessForIntegration(integrationId: string): Promise<{ integration: Integration; accessToken: string }> {
  const admin = createSupabaseAdmin()
  const { data: integration, error } = await admin.from('calendar_integrations').select(
    'id,client_id,credential_id,calendar_id,display_name,timezone,status',
  ).eq('id', integrationId).single()
  if (error || !integration || integration.status !== 'active') throw new Error('Calendar integration unavailable')
  const { data: credential, error: credentialError } = await admin.from('calendar_credentials')
    .select('ciphertext,iv,auth_tag,key_version').eq('id', integration.credential_id)
    .eq('client_id', integration.client_id).single()
  if (credentialError || !credential) throw new Error('Calendar credential unavailable')
  const refreshToken = decryptCalendarRefreshToken({
    ciphertext: credential.ciphertext, iv: credential.iv, authTag: credential.auth_tag,
    keyVersion: credential.key_version,
  } satisfies EncryptedCredential)
  return { integration: integration as Integration, accessToken: await refreshGoogleAccessToken(refreshToken) }
}

export function webhookAddress(): string { return `${portalOrigin()}/api/portal/google-calendar/webhook` }
export function newChannelId(): string { return `portal-${randomUUID()}` }
