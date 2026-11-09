import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import StrategyPreview from './StrategyPreview'
import ReportsView from '@/app/client/[slug]/reports/ReportsView'
import OctoberReportBody from '@/app/client/[slug]/reports/october-2026/OctoberReportBody'
import { octoberSnapshots, octoberComparisonLabel, octoberMeasurementNotes, octoberMetricLabels, octoberOverviewDescription } from './snapshots'
import styles from './preview.module.css'

export const dynamic = 'force-dynamic'
const base = '/admin/portal/reports/october-2026-preview'

export default async function OctoberReportPreview({ searchParams }: {
  searchParams: Promise<{ view?: string }>
}) {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const view = (await searchParams).view
  const detail = view === 'report'
  const strategy = view === 'strategy'
  return <>
    <aside className={styles.notice} aria-label="Agency preview">
      <p><strong>October preview for Anastasia.</strong> Draft wording and captured figures. Nothing here is released to Maria. Earlier snapshots remain unchanged when this is released.</p>
      <nav className={styles.nav} aria-label="Preview pages">
        <Link href={base} aria-current={!detail && !strategy ? 'page' : undefined}>Reports page</Link>
        <Link href={`${base}?view=report`} aria-current={detail ? 'page' : undefined}>October report</Link>
        <Link href={`${base}?view=strategy`} aria-current={strategy ? 'page' : undefined}>October Strategy</Link>
        <Link href="/admin/portal/reports">Agency reports</Link>
      </nav>
    </aside>
    {strategy ? <StrategyPreview backHref={base} /> : detail ? <OctoberReportBody backHref={base} backLabel="← Reports" /> :
      <ReportsView slug="kanset" rows={octoberSnapshots} comparisonLabel={octoberComparisonLabel} measurementNotes={octoberMeasurementNotes} latestMetricLabels={octoberMetricLabels} backHref="/admin/portal/reports" featured={{
        month: 'October 2026', href: `${base}?view=report`,
        description: octoberOverviewDescription,
      }} />}
  </>
}
