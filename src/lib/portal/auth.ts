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
}

// Resolves the signed-in user's membership for a SPECIFIC client (by slug).
// Returns null when logged out or not a member of that client; throws
// PortalAuthError only on a real Supabase/auth failure (an outage is NOT "logged out").
// Wrapped in React cache() so the layout guard and the page share ONE lookup per request
// (request-scoped, cookie/identity dependent, so not a persistent cache).
export const getClientSession = cache(async (clientSlug: string): Promise<ClientSession | null> => {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError) {
    if (isAuthSessionMissingError(authError)) return null // no session == logged out
    throw new PortalAuthError(authError.message)           // network/server/auth-service failure
  }
  if (!user) return null
  const { data, error } = await supabase
    .from('client_users')
    .select('name, email, client_id, clients!inner ( slug )')
    .eq('auth_user_id', user.id)
    .eq('clients.slug', clientSlug)
    .maybeSingle()
  if (error) throw new PortalAuthError(error.message)
  if (!data) return null
  const client = data.clients as unknown as { slug: string } | null
  if (!client) throw new PortalAuthError('Client membership relation is missing')
  return {
    userId: user.id,
    email: data.email,
    name: data.name,
    clientId: data.client_id,
    clientSlug: client.slug,
  }
})
