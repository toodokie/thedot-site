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
  reach: 'Reach',
  engagement: 'Engagement',
  saves: 'Saves',
  profile_visits: 'Profile visits',
  follower_growth: 'Follower growth',
  traffic: 'Traffic',
  contact_clicks: 'Contact clicks',
  impressions: 'Impressions',
  views: 'Views',
  likes: 'Likes',
  comments: 'Comments',
  shares: 'Shares',
  clicks: 'Clicks',
  new_followers: 'New followers',
  subscribers: 'Subscribers',
  watch_time: 'Watch time',
}
// Preferred display order; present keys not listed here follow, alphabetically.
const KNOWN_ORDER = [
  'reach', 'impressions', 'views', 'engagement', 'saves', 'likes', 'comments', 'shares',
  'profile_visits', 'clicks', 'contact_clicks', 'follower_growth', 'new_followers',
  'subscribers', 'watch_time', 'traffic',
]
// Keys handled by their own renderers, not the scalar tile grid.
const SPECIAL_KEYS = new Set(['top_posts', 'top_pages', 'summary'])

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', website: 'Website',
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

// '2026-07-H1' -> 'Jul 2026 · 1st half', for the compact jump-nav. Falls back to raw.
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatPeriodShort(period: string) {
  const m = /^(\d{4})-(\d{2})-H([12])$/.exec(period)
  if (!m) return period
  const [, year, month, half] = m
  const name = MONTHS_SHORT[Number(month) - 1]
  if (!name) return period
  return `${name} ${year} · ${half === '1' ? '1st half' : '2nd half'}`
}

// Stable, URL-safe anchor id for a period section.
const periodAnchor = (period: string) => `period-${period.replace(/[^a-zA-Z0-9-]/g, '-')}`

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
function scalarTiles(metrics: Record<string, unknown>): Tile[] {
  const tiles: Tile[] = []
  for (const [key, raw] of Object.entries(metrics)) {
    if (SPECIAL_KEYS.has(key)) continue
    const s = asScalar(raw)
    if (!s) continue // skip unknown / unrenderable shapes and empties
    tiles.push({ key, label: METRIC_LABELS[key] ?? humanize(key), value: s.value, prev: s.prev })
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
  const tiles = scalarTiles(metrics)
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

  return (
    <article className={styles.card}>
      <div className={styles.cardHead}>
        <span className={styles.platformBar} aria-hidden="true" />
        <span className={styles.platform}>{platformLabel(row.platform)}</span>
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

  const rows = await getReports(session.clientId)
  const periods = groupByPeriod(rows)

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

      {periods.length === 0 ? (
        <div className={styles.empty}>
          <Text tone="graphite">
            No reports yet. Your first performance snapshot lands here after the first full posting cycle.
          </Text>
        </div>
      ) : (
        <>
          {/* Jump-nav: only earns its keep once there's more than one period to browse. */}
          {periods.length > 1 && (
            <nav className={styles.jump} aria-label="Jump to a reporting period">
              <span className={styles.jumpLabel}>Periods</span>
              <div className={styles.jumpLinks}>
                {periods.map(({ period }) => (
                  <a className={styles.jumpLink} href={`#${periodAnchor(period)}`} key={period}>
                    {formatPeriodShort(period)}
                  </a>
                ))}
              </div>
            </nav>
          )}

          {periods.map(({ period, rows: platformRows }) => (
            <section className={styles.period} id={periodAnchor(period)} key={period}>
              <div className={styles.periodHead}>
                <Heading level={3}>{formatPeriod(period)}</Heading>
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
    </div>
  )
}
