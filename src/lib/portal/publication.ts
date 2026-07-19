import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'

export type PublicationTargetRow = {
  id: string
  content_id: string
  content_version: number
  destination: string
  required: boolean
  expected_visibility: 'public' | 'unlisted' | 'other'
  status: 'pending' | 'live' | 'removed' | 'unavailable' | 'failed'
  live_url: string | null
  published_at: string | null
  first_verified_at: string | null
  last_verified_at: string | null
  reconciliation_status: 'pending' | 'verified' | 'unverified' | 'conflicted'
  verification_label: string
  current_provider_state: string | null
  current_visibility: string | null
  observed_at: string | null
}

export async function getPublicationDetails(
  clientId: string,
  contentId: string,
  contentVersion: number,
): Promise<PublicationTargetRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('content_publication_targets_client')
    .select('id, content_id, content_version, destination, required, expected_visibility, status, live_url, published_at, first_verified_at, last_verified_at, reconciliation_status, verification_label, current_provider_state, current_visibility, observed_at')
    .eq('client_id', clientId)
    .eq('content_id', contentId)
    .eq('content_version', contentVersion)
    .order('destination', { ascending: true })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as PublicationTargetRow[]
}
