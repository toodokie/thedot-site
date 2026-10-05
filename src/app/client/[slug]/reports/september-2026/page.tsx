import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import MarkReportViewed from '../MarkReportViewed'
import SeptemberReportBody from './SeptemberReportBody'
import PageFeedback from '../../PageFeedback'

export const metadata = {
  title: 'Kanset September 2026 Performance Report | The Dot Creative',
  description: 'Kanset social media and website performance for September 2026.',
}

// Release gate. While false, only the agency preview seat can open this page; every other seat,
// Maria's included, gets a 404. Nothing links here until the gate opens. Flip to true at release,
// together with the reports index and overview cards. The agency reviews the draft at
// /admin/portal/reports/september-2026-preview.
const PUBLISHED = true
const PREVIEW_EMAILS = ['toodokie@gmail.com']

export default async function SeptemberReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (slug !== 'kanset') notFound()
  if (!PUBLISHED && !PREVIEW_EMAILS.includes(session.email.toLowerCase())) notFound()

  return (
    <>
      {PUBLISHED && <MarkReportViewed slug={slug} reportKey="2026-09" />}
      <SeptemberReportBody backHref={`/client/${encodeURIComponent(slug)}/reports`} backLabel="← Performance reports"
        feedback={<PageFeedback slug={slug} topic="Feedback on the September 2026 report" />}
        strategyHref={`/client/${encodeURIComponent(slug)}/strategy`} />
    </>
  )
}
