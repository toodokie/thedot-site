import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import AdminPageHeader from '../AdminPageHeader'
import { loadReports, type ReportRow } from '../mirror-data'
import styles from '../portal-admin.module.css'

export const dynamic = 'force-dynamic'

// Metrics are agent-fed and free-form, so the agency dashboard uses the same defensive
// scalar/object contract as the client dashboard. Unknown nested objects are omitted.
type Scalar = { value: number | string; prev?: number | string }
function asScalar(v: unknown): Scalar | null {
  if (typeof v === 'number' || typeof v === 'string') return { value: v }
  if (!v || typeof v !== 'object') return null
  const record = v as Record<string, unknown>
  const value = record.value ?? record.current
  if (typeof value !== 'number' && typeof value !== 'string') return null
  const prev = record.prev ?? record.previous
  return { value, prev: typeof prev === 'number' || typeof prev === 'string' ? prev : undefined }
}

const METRIC_LABELS: Record<string, string> = {
  reach: 'Reach', engagement: 'Engagement', saves: 'Saves', profile_visits: 'Profile visits',
  follower_growth: 'Follower growth', traffic: 'Traffic', contact_clicks: 'Contact clicks',
  impressions: 'Impressions', views: 'Views', likes: 'Likes', comments: 'Comments',
  shares: 'Shares', clicks: 'Clicks', new_followers: 'New followers', subscribers: 'Subscribers',
  watch_time: 'Watch time',
}
const METRIC_ORDER = ['reach', 'impressions', 'views', 'engagement', 'saves', 'likes', 'comments', 'shares',
  'profile_visits', 'clicks', 'contact_clicks', 'follower_growth', 'new_followers', 'subscribers', 'watch_time', 'traffic']
const SPECIAL_KEYS = new Set(['top_posts', 'top_pages', 'summary'])
function humanize(key: string) {
  const value = key.replaceAll('_', ' ')
  return value.charAt(0).toUpperCase() + value.slice(1)
}
function scalarMetrics(metrics: Record<string, unknown>) {
  return Object.entries(metrics)
    .filter(([key]) => !SPECIAL_KEYS.has(key))
    .map(([key, value]) => ({ key, scalar: asScalar(value) }))
    .filter((item): item is { key: string; scalar: Scalar } => item.scalar !== null)
    .sort((a, b) => (METRIC_ORDER.indexOf(a.key) - METRIC_ORDER.indexOf(b.key)) || a.key.localeCompare(b.key))
    .slice(0, 16)
}
function listItems(value: unknown, labelKey: 'title' | 'page', metricKey: 'metric' | 'views') {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const label = record[labelKey]
    if (typeof label !== 'string' || !label) return []
    const metric = record[metricKey]
    const rawHref = labelKey === 'title' ? record.url : record.page
    const href = typeof rawHref === 'string' && /^https?:\/\//i.test(rawHref) ? rawHref : undefined
    return [{ label, href, metric: typeof metric === 'number' || typeof metric === 'string' ? metric : null }]
  }).slice(0, 5)
}
function platformLabel(platform: string) {
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

const PLATFORM_ORDER = ['instagram', 'facebook', 'youtube', 'linkedin', 'website']
function latestByPlatform(rows: ReportRow[]): ReportRow[] {
  const best = new Map<string, ReportRow>()
  for (const row of rows) {
    const current = best.get(row.platform)
    if (!current || row.period_start > current.period_start) best.set(row.platform, row)
  }
  const rank = (platform: string) => {
    const index = PLATFORM_ORDER.indexOf(platform)
    return index < 0 ? PLATFORM_ORDER.length : index
  }
  return [...best.values()].sort((a, b) => rank(a.platform) - rank(b.platform) || a.platform.localeCompare(b.platform))
}

function formatWindow(start: string, end: string): string {
  return `${start} to ${end}`
}

function ReportCard({ r }: { r: ReportRow }) {
  const metrics = scalarMetrics(r.metrics ?? {})
  const topPosts = listItems(r.metrics?.top_posts, 'title', 'metric')
  const topPages = listItems(r.metrics?.top_pages, 'page', 'views')
  return (
    <article className={`${styles.subCard} ${styles.reportCard}`}>
      <div className={styles.reportCardHead}>
        <span className={styles.reportPlatformBar} aria-hidden="true" />
        <span className={styles.reportPlatform}>
          <span className={styles.reportPlatformName}>{platformLabel(r.platform)}</span>
          <span className={styles.reportWindow}>Data window: {formatWindow(r.period_start, r.period_end)}</span>
        </span>
      </div>
      {metrics.length > 0 && <div className={styles.reportMetrics}>
        {metrics.map(({ key, scalar }) => (
          <div key={key} className={styles.reportMetric}>
            <span className={styles.reportMetricLabel}>{METRIC_LABELS[key] ?? humanize(key)}</span>
            <span className={styles.reportMetricValue}>{scalar.value}</span>
            {scalar.prev !== undefined && <span className={styles.reportMetricPrev}>prev {scalar.prev}</span>}
          </div>
        ))}
      </div>}
      {topPosts.length > 0 && <ReportList title="Top posts" items={topPosts} />}
      {topPages.length > 0 && <ReportList title="Top pages" items={topPages} />}
      {r.summary && <p className={styles.reportSummary}>{r.summary}</p>}
      {metrics.length === 0 && topPosts.length === 0 && topPages.length === 0 && !r.summary && (
        <p className={styles.reportEmpty}>No metrics recorded for this period yet.</p>
      )}
    </article>
  )
}

function ReportList({ title, items }: { title: string; items: Array<{ label: string; href?: string; metric: string | number | null }> }) {
  return <div className={styles.reportList}>
    <div className={styles.reportListTitle}>{title}</div>
    {items.map((item, index) => <div key={`${item.label}-${index}`} className={styles.reportListRow}>
      <span className={styles.reportListLabel}>
        {item.href
          ? <a href={item.href} target="_blank" rel="noopener noreferrer">{item.label}</a>
          : item.label}
      </span>
      {item.metric !== null && <span className={styles.reportListMetric}>{item.metric}</span>}
    </div>)}
  </div>
}

export default async function PortalAdminReportsPage() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')
  const rows = (await loadReports()).filter((r) => r.schema_version >= 1)
  const latest = latestByPlatform(rows)
  const latestIds = new Set(latest.map((row) => row.id))
  const history = rows.filter((row) => !latestIds.has(row.id))
  const periods = [...new Set(history.map((row) => row.period))]
  return (
    <>
      <AdminPageHeader kicker="Agency ops" title="Reports"
        intro="The twice-monthly performance review Maria sees, one snapshot per platform per half-month period."
        count={rows.length} countLabel="snapshots" />
      <section className={styles.card}>
        {rows.length === 0
          ? <p className={styles.empty}>No report snapshots yet.</p>
          : <>
            <div className={styles.reportSectionHead}><span className={styles.groupLabel}>Latest by platform</span><span className={styles.meta}>{latest.length} platforms</span></div>
            <div className={styles.reportGrid}>{latest.map((r) => <ReportCard key={r.id} r={r} />)}</div>
            {periods.length > 0 && <>
              <div className={styles.reportHistoryHead}><span className={styles.groupLabel}>Earlier snapshots</span></div>
              {periods.map((period) => (
                <div key={period} className={styles.reportPeriod}>
                  <div className={styles.reportPeriodHead}><span className={styles.subCardTitle}>{period}</span></div>
                  <div className={styles.reportGrid}>{history.filter((row) => row.period === period).map((r) => <ReportCard key={r.id} r={r} />)}</div>
                </div>
              ))}
            </>}
          </>}
      </section>
    </>
  )
}
