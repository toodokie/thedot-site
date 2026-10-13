import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from '@/lib/portal/data'

export async function getReportViewedAt(
  clientId: string,
  reportKey: string,
): Promise<string | null> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('portal_report_views')
    .select('viewed_at')
    .eq('client_id', clientId)
    .eq('report_key', reportKey)
    .maybeSingle()
  if (error) throw new PortalDataError(error.message)
  return (data?.viewed_at as string | undefined) ?? null
}
