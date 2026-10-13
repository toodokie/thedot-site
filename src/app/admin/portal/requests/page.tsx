import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import RequestAdmin from '../RequestAdmin'
import { loadClientProposals, loadRequests } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminRequestsPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const [requests, proposals] = await Promise.all([loadRequests(), loadClientProposals()])
  return <RequestAdmin requests={requests} proposals={proposals} />
}
