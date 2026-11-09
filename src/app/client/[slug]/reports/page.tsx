import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getReports } from '@/lib/portal/reports'
import ReportsView from './ReportsView'
import { octoberComparisonLabel, octoberMeasurementNotes, octoberMetricLabels, octoberOverviewDescription } from './october-2026/metadata'

export default async function Reports({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  const rows = await getReports(session.clientId)
  const october = slug === 'kanset' && rows.some(row => row.period_start === '2026-10-01' && row.period_end === '2026-10-31' && row.schema_version >= 1)
  return <ReportsView slug={slug} rows={rows}
    {...(october ? {
      featured: { month: 'October 2026', href: `/client/${encodeURIComponent(slug)}/reports/october-2026`, description: octoberOverviewDescription },
      comparisonLabel: octoberComparisonLabel,
      measurementNotes: octoberMeasurementNotes,
      latestMetricLabels: octoberMetricLabels,
    } : {})} />
}
