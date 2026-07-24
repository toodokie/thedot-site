import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import RequestAdmin from '../RequestAdmin'
import { loadRequests } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminRequestsPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const requests = await loadRequests()
  return <RequestAdmin requests={requests} />
}
