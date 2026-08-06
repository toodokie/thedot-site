import { redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import { getReports, groupByPeriod, type ReportRow } from '@/lib/portal/reports'
import { Eyebrow, Heading, Text, Button } from '@thedot/design-system'
import styles from './reports.module.css'

// ---------------------------------------------------------------------------
// Formatting helpers. Metrics are AGENT-FED and free-form, so everything here
// is defensive: coerce what we recognise, skip what we don't, never throw.
// ---------------------------------------------------------------------------

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const fmtNum = (n: number) => nf.format(n)
const fmtPct = (n: number) => `${nf.format(Math.abs(n))}%`

// Curated labels for the metrics we expect most; anything else is humanised.
const METRIC_LABELS: Record<string, string> = {
  followers: 'Followers',
  reach: 'Reach',
  interactions: 'Interactions',
  saves: 'Saves',
  profile_visits: 'Profile visits',
  views: 'Views',
  comments: 'Comments',
  shares: 'Shares',
  messaging_contacts: 'Message inquiries',
  views_reels: 'Reel views',
  views_posts: 'Post views',
  views_stories: 'Story views',
  watch_time_hours: 'Watch time (hours)',
  avg_view_duration_seconds: 'Average view (seconds)',
  subscribers_gained: 'Subscribers gained',
  views_shorts: 'Shorts views',
  views_videos: 'Video views',
  sessions: 'Visits',
  social_referral_visits: 'Social referral visits',
  contact_page_views: 'Contact-page views',
  news_article_views: 'New article views',
  form_submissions: 'Form submissions',
  button_clicks: 'Site button clicks',
}
const PLATFORM_METRIC_LABELS: Record<string, Record<string, string>> = {
  website: {
    reach: 'Unique visitors',
    views: 'Pageviews',
  },
}
// Preferred display order; present keys not listed here follow, alphabetically.
const KNOWN_ORDER = [
  'followers', 'reach', 'views', 'interactions', 'comments', 'shares', 'saves',
  'profile_visits', 'messaging_contacts', 'sessions', 'social_referral_visits',
  'contact_page_views', 'news_article_views', 'form_submissions', 'button_clicks',
  'watch_time_hours', 'avg_view_duration_seconds', 'subscribers_gained',
  'views_reels', 'views_posts', 'views_stories', 'views_shorts', 'views_videos',
]
// Keys handled by their own renderers, not the scalar tile grid.
const SPECIAL_KEYS = new Set(['top_posts', 'top_pages', 'summary'])

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', linkedin: 'LinkedIn', website: 'Website',
}

function humanize(key: string) {
  const s = key.replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function platformLabel(p: string) {
  return PLATFORM_LABELS[p] ?? (p.charAt(0).toUpperCase() + p.slice(1))
}

// '2026-07-H1' -> 'July 2026, first half'. Falls back to the raw string.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
function formatPeriod(period: string) {
  const m = /^(\d{4})-(\d{2})-H([12])$/.exec(period)
  if (!m) return period
  const [, year, month, half] = m
  const name = MONTHS[Number(month) - 1]
  if (!name) return period
  return `${name} ${year}, ${half === '1' ? 'first half' : 'second half'}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Each card is labelled with its OWN clearly formatted data window (platforms can cover
// different windows in the same cycle, so a single global period label misleads).
// '2026-07-03'..'2026-07-17' -> 'Jul 3 - 17, 2026'.
function formatWindow(startIso: string, endIso: string): string | null {
  const s = /^(\d{4})-(\d{2})-(\d{2})/.exec(startIso ?? '')
  const e = /^(\d{4})-(\d{2})-(\d{2})/.exec(endIso ?? '')
  if (!s || !e) return null
  const [, sy, sm, sd] = s.map(Number) as unknown as [number, number, number, number]
  const [, ey, em, ed] = e.map(Number) as unknown as [number, number, number, number]
  const sName = MONTHS_SHORT[sm - 1]
  const eName = MONTHS_SHORT[em - 1]
  if (!sName || !eName) return null
  if (sy === ey && sm === em) return `${sName} ${sd} - ${ed}, ${sy}`
  if (sy === ey) return `${sName} ${sd} - ${eName} ${ed}, ${sy}`
  return `${sName} ${sd}, ${sy} - ${eName} ${ed}, ${ey}`
}

// The primary view is ONE card per platform: the platform's newest snapshot, preferring
// real v1 snapshots over the retiring v0 demo rows whenever both exist.
const PLATFORM_ORDER = ['instagram', 'facebook', 'youtube', 'linkedin', 'website']
function latestByPlatform(rows: ReportRow[]): ReportRow[] {
  const best = new Map<string, ReportRow>()
  for (const row of rows) {
    const current = best.get(row.platform)
    if (!current) { best.set(row.platform, row); continue }
    const rowV1 = row.schema_version >= 1
    const currentV1 = current.schema_version >= 1
    const better = rowV1 !== currentV1 ? rowV1 : row.period_start > current.period_start
    if (better) best.set(row.platform, row)
  }
  const rank = (p: string) => {
    const i = PLATFORM_ORDER.indexOf(p)
    return i === -1 ? PLATFORM_ORDER.length : i
  }
  return [...best.values()].sort(
    (a, b) => rank(a.platform) - rank(b.platform) || a.platform.localeCompare(b.platform),
  )
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

type Scalar = { value: number; prev?: number }
// Accepts a plain number OR { value, prev }. Anything else is not a scalar metric.
function asScalar(v: unknown): Scalar | null {
  if (isNum(v)) return { value: v }
  if (v && typeof v === 'object' && 'value' in v) {
    const o = v as { value?: unknown; prev?: unknown }
    if (isNum(o.value)) return { value: o.value, prev: isNum(o.prev) ? o.prev : undefined }
  }
  return null
}

type Tile = { key: string; label: string; value: number; prev?: number }
function scalarTiles(metrics: Record<string, unknown>, platform: string): Tile[] {
  const tiles: Tile[] = []
  for (const [key, raw] of Object.entries(metrics)) {
    if (SPECIAL_KEYS.has(key)) continue
    const s = asScalar(raw)
    if (!s) continue // skip unknown / unrenderable shapes and empties
    const platformLabel = PLATFORM_METRIC_LABELS[platform]?.[key]
    tiles.push({ key, label: platformLabel ?? METRIC_LABELS[key] ?? humanize(key), value: s.value, prev: s.prev })
  }
  const rank = (k: string) => {
    const i = KNOWN_ORDER.indexOf(k)
    return i === -1 ? KNOWN_ORDER.length : i
  }
  return tiles.sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label))
}

type TopPost = { title?: string; url?: string; metric?: string | number }
function topPosts(v: unknown): TopPost[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      title: typeof x.title === 'string' ? x.title : undefined,
      url: typeof x.url === 'string' ? x.url : undefined,
      metric: typeof x.metric === 'string' || isNum(x.metric) ? (x.metric as string | number) : undefined,
    }))
    .filter((p) => p.title || p.url)
}

type TopPage = { page?: string; views?: number | string }
function topPages(v: unknown): TopPage[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      page: typeof x.page === 'string' ? x.page : undefined,
      views: isNum(x.views) || typeof x.views === 'string' ? (x.views as number | string) : undefined,
    }))
    .filter((p) => p.page)
}

const isHttp = (s: string) => /^https?:\/\//i.test(s)
const fmtMaybe = (v: number | string | undefined) =>
  v === undefined ? null : isNum(v) ? fmtNum(v) : v

// ---------------------------------------------------------------------------
// Presentational pieces (server components, no interactivity).
// ---------------------------------------------------------------------------

function Delta({ value, prev }: { value: number; prev: number }) {
  const diff = value - prev
  const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•' // ▲ ▼ •
  const label =
    prev === 0
      ? (diff > 0 ? `new (+${fmtNum(diff)})` : '0%')
      : fmtPct((diff / prev) * 100)
  return (
    <span className={`${styles.delta} ${styles[dir]}`}>
      <span className={styles.deltaArrow} aria-hidden="true">{arrow}</span>
      <span>{label}</span>
    </span>
  )
}

function MetricTile({ tile }: { tile: Tile }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{tile.label}</span>
      <span className={styles.tileValue}>{fmtNum(tile.value)}</span>
      {tile.prev !== undefined && (
        <>
          <Delta value={tile.value} prev={tile.prev} />
          <span className={styles.prev}>prev {fmtNum(tile.prev)}</span>
        </>
      )}
    </div>
  )
}

function TopList({
  heading, items,
}: {
  heading: string
  items: { label: string; href?: string; metric: string | null }[]
}) {
  if (items.length === 0) return null
  return (
    <div className={styles.list}>
      <div className={styles.listHead}>{heading}</div>
      {items.map((it, i) => (
        <div className={styles.listRow} key={`${it.label}-${i}`}>
          <span className={styles.listMain}>
            {it.href ? (
              <a className={styles.listLink} href={it.href} target="_blank" rel="noopener noreferrer">
                {it.label}
              </a>
            ) : (
              <span className={styles.listPlain}>{it.label}</span>
            )}
          </span>
          {it.metric && <span className={styles.listMetric}>{it.metric}</span>}
        </div>
      ))}
    </div>
  )
}

function PlatformCard({ row }: { row: ReportRow }) {
  const metrics = (row.metrics ?? {}) as Record<string, unknown>
  const tiles = scalarTiles(metrics, row.platform)
  const posts = topPosts(metrics.top_posts).map((p) => ({
    label: p.title ?? p.url ?? '',
    href: p.url && isHttp(p.url) ? p.url : undefined,
    metric: fmtMaybe(p.metric),
  }))
  const pages = topPages(metrics.top_pages).map((p) => ({
    label: p.page ?? '',
    href: p.page && isHttp(p.page) ? p.page : undefined,
    metric: fmtMaybe(p.views),
  }))
  const hasBody = tiles.length > 0 || posts.length > 0 || pages.length > 0 || !!row.summary
  const window = formatWindow(row.period_start, row.period_end)

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.platformBar} aria-hidden="true" />
        <span className={styles.platformCol}>
          <span className={styles.platform}>{platformLabel(row.platform)}</span>
          {window && <span className={styles.dataWindow}>Data window: {window}</span>}
        </span>
      </div>

      {tiles.length > 0 && (
        <div className={styles.metrics}>
          {tiles.map((t) => <MetricTile key={t.key} tile={t} />)}
        </div>
      )}

      <TopList heading="Top posts" items={posts} />
      <TopList heading="Top pages" items={pages} />

      {row.summary && (
        <div className={styles.summary}>
          <span className={styles.summaryLabel}>The read</span>
          <Text tone="graphite">{row.summary}</Text>
        </div>
      )}

      {!hasBody && (
        <div className={styles.noMetrics}>
          <Text tone="grey">No metrics recorded for this period yet.</Text>
        </div>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------

export default async function Reports({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')

  // Fabricated-data ban (Anastasia, 2026-07-20, after a demo snapshot showed fake saves on a real
  // post's title): schema v0 rows are demo-only and NEVER render, in any section. 0019 deletes them.
  const rows = (await getReports(session.clientId)).filter((row) => row.schema_version >= 1)

  // Primary view: the newest snapshot per platform (v1 preferred over the retiring v0
  // demo rows). History: everything else, still grouped by period, minus v0 rows for
  // platforms that already have real v1 data (pure noise while the purge is pending).
  const latest = latestByPlatform(rows)
  const latestIds = new Set(latest.map((row) => row.id))
  const platformsWithV1 = new Set(
    rows.filter((row) => row.schema_version >= 1).map((row) => row.platform),
  )
  const historyRows = rows.filter(
    (row) =>
      !latestIds.has(row.id) &&
      !(row.schema_version < 1 && platformsWithV1.has(row.platform)),
  )
  const historyPeriods = groupByPeriod(historyRows)

  return (
    <div className={styles.wrap}>
      <div className={styles.back}>
        <Button as="a" href={`/client/${encodeURIComponent(slug)}`} variant="ghost" size="sm">Back</Button>
      </div>

      <div className={styles.eyebrow}><Eyebrow tone="grey">Kanset · Reports</Eyebrow></div>
      <div className={styles.header}><Heading level={2}>Performance reports</Heading></div>
      <div className={styles.intro}>
        <Text size="lg" tone="graphite">
          Your twice-monthly read on how the content performed, broken out by platform. The numbers are
          pulled and reviewed by hand, so treat them as a directional signal, not a live dashboard.
        </Text>
      </div>

      {slug === 'kanset' && (
        <section className={styles.featured} aria-label="July 2026 performance report">
          <div>
            <span className={styles.featuredKicker}>Monthly review · Published August 4</span>
            <Heading level={3}>July 2026 performance report</Heading>
            <Text tone="graphite">
              The first full month of managed content, including the June baseline, website activity,
              the creative findings, and the August actions.
            </Text>
          </div>
          <Button as="a" href={`/client/${encodeURIComponent(slug)}/reports/july-2026`} variant="black" size="sm">
            Open July report
          </Button>
        </section>
      )}

      {rows.length === 0 ? (
        <div className={styles.empty}>
          <Text tone="graphite">
            No reports yet. Your first performance snapshot lands here after the first full posting cycle.
          </Text>
        </div>
      ) : (
        <>
          {/* Primary view: one card per platform, side by side, each labelled with its
              own data window (platform windows can differ within the same cycle). */}
          <section className={styles.period}>
            <div className={styles.periodHead}>
              <Heading level={3}>Latest by platform</Heading>
              <span className={styles.periodMeta}>
                {latest.length} {latest.length === 1 ? 'platform' : 'platforms'}
              </span>
            </div>
            <div className={styles.cards}>
              {latest.map((row) => <PlatformCard key={row.id} row={row} />)}
            </div>
          </section>

          {/* History: earlier snapshots, still grouped by reporting period. */}
          {historyPeriods.length > 0 && (
            <>
              <div className={styles.historyHead}>
                <Heading level={3}>Earlier snapshots</Heading>
              </div>
              {historyPeriods.map(({ period, rows: platformRows }) => (
                <section className={styles.period} key={period}>
                  <div className={styles.periodHead}>
                    <Heading level={4}>{formatPeriod(period)}</Heading>
                    <span className={styles.periodMeta}>
                      {platformRows.length} {platformRows.length === 1 ? 'platform' : 'platforms'}
                    </span>
                  </div>
                  <div className={styles.cards}>
                    {platformRows.map((row) => <PlatformCard key={row.id} row={row} />)}
                  </div>
                </section>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
