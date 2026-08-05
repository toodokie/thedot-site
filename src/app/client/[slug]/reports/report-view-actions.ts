'use server'

import { getClientSession } from '@/lib/portal/auth'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function markReportViewed(slug: string, reportKey: string): Promise<void> {
  const session = await getClientSession(slug)
  if (!session) return
  const supabase = await createSupabaseServer()
  const { error } = await supabase.rpc('mark_portal_report_viewed', {
    p_client_id: session.clientId,
    p_report_key: reportKey,
  })
  if (error) console.error('mark report viewed failed:', error.message)
}
