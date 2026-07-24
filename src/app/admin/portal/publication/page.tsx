import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import PublicationAdmin from '../PublicationAdmin'
import { loadPublicationTargets } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminPublicationPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const targets = await loadPublicationTargets()
  return <PublicationAdmin targets={targets} />
}
