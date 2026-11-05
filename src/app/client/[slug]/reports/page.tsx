import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getReports } from '@/lib/portal/reports'
import ReportsView from './ReportsView'

export default async function Reports({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  return <ReportsView slug={slug} rows={await getReports(session.clientId)} />
}
