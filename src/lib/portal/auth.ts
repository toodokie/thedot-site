import { cache } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isAuthSessionMissingError } from '@supabase/auth-js'

export class PortalAuthError extends Error {}

export type ClientSession = {
  userId: string
  email: string
  name: string | null
  clientId: string
  clientSlug: string
  role: string
  canDecide: boolean
  canComment: boolean
  canSubmitRequests: boolean
  canManageSchedule: boolean
  canUseAssistant: boolean
}

// Resolves the signed-in user's membership for a SPECIFIC client (by slug).
// Returns null when logged out or not a member of that client; throws
// PortalAuthError only on a real Supabase/auth failure (an outage is NOT "logged out").
// Wrapped in React cache() so the layout guard and the page share ONE lookup per request
// (request-scoped, cookie/identity dependent, so not a persistent cache).
export const getClientSession = cache(async (clientSlug: string): Promise<ClientSession | null> => {
  const supabase = await createSupabaseServer()
  const { data: claimsData, error: authError } = await supabase.auth.getClaims()
  if (authError) {
    if (isAuthSessionMissingError(authError)) return null // no session == logged out
    throw new PortalAuthError(authError.message)           // network/server/auth-service failure
  }
  const userId = typeof claimsData?.claims.sub === 'string' ? claimsData.claims.sub : null
  if (!userId) return null
  const { data, error } = await supabase.rpc('portal_client_session', { p_slug: clientSlug })
  if (error) throw new PortalAuthError(error.message)
  const rows = data as unknown as Array<{
    user_id: string
    email: string
    name: string | null
    role: string
    client_id: string
    client_slug: string
    can_decide: boolean
    can_comment: boolean
    can_submit_requests: boolean
    can_manage_schedule: boolean
    can_use_assistant: boolean
  }> | null
  const membership = rows?.[0]
  if (!membership) return null
  if (membership.user_id !== userId) throw new PortalAuthError('Client session identity mismatch')
  return {
    userId,
    email: membership.email,
    name: membership.name,
    clientId: membership.client_id,
    clientSlug: membership.client_slug,
    role: membership.role,
    canDecide: membership.can_decide,
    canComment: membership.can_comment,
    canSubmitRequests: membership.can_submit_requests,
    canManageSchedule: membership.can_manage_schedule,
    canUseAssistant: membership.can_use_assistant,
  }
})
