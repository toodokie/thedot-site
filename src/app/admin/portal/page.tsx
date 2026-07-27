import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import { MyTasksAdmin } from './GatesAdmin'
import { loadMyTasksData } from './data'

// Default surface of the ops portal: My tasks. The shell (layout.tsx) owns the nav + frame.
export const dynamic = 'force-dynamic'

export default async function PortalAdminMyTasksPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const { pieces, opsTasks, completedOps, openComments, todayIso } = await loadMyTasksData()
  return <MyTasksAdmin pieces={pieces} opsTasks={opsTasks} completedOps={completedOps}
    openComments={openComments} todayIso={todayIso} />
}
