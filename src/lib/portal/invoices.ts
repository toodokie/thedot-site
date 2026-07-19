import { createSupabaseServer } from '@/lib/supabase/server'
import { PortalDataError } from './data'

// One client-visible invoice. Read from the invoices_client view, which exposes only the safe
// billing fields (never notes, the private object key, or created_at). numeric amount arrives as a
// string from PostgREST; the surface formats it.
export type InvoiceRow = {
  id: string
  client_id: string
  number: string
  issued_at: string
  period_start: string | null
  period_end: string | null
  amount: string
  currency: string
  status: 'paid' | 'unpaid' | 'void'
  document_url: string | null
  updated_at: string
}

const SELECT =
  'id, client_id, number, issued_at, period_start, period_end, amount, currency, status, document_url, updated_at'

// A client's invoices, newest first. RLS already scopes to the caller's tenant; the client_id
// filter is belt-and-suspenders. Throws PortalDataError on failure.
export async function getInvoices(clientId: string): Promise<InvoiceRow[]> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('invoices_client')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('issued_at', { ascending: false })
  if (error) throw new PortalDataError(error.message)
  return (data ?? []) as InvoiceRow[]
}
