import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import BillingAdmin from '../BillingAdmin'
import { loadInvoices } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminBillingPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const invoices = await loadInvoices()
  return <BillingAdmin invoices={invoices} />
}
