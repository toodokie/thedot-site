import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import MarkReportViewed from '../MarkReportViewed'
import OctoberReportBody from './OctoberReportBody'
import PageFeedback from '../../PageFeedback'

export const metadata = {
  title: 'Kanset October 2026 Performance Report | The Dot Creative',
  description: 'Kanset social media and website performance for October 2026.',
}

export default async function OctoberReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (slug !== 'kanset') notFound()
  return <>
    <MarkReportViewed slug={slug} reportKey="2026-10" />
    <OctoberReportBody backHref={`/client/${encodeURIComponent(slug)}/reports`} backLabel="← Performance reports"
      feedback={<PageFeedback slug={slug} topic="Feedback on the October 2026 report" />}
      strategyHref={`/client/${encodeURIComponent(slug)}/strategy`} />
  </>
}
