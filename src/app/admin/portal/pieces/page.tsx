import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { PiecesAdmin } from '../GatesAdmin'
import { loadPieces } from '../data'

export const dynamic = 'force-dynamic'

export default async function PortalAdminPiecesPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const pieces = await loadPieces()
  return <PiecesAdmin pieces={pieces} />
}
