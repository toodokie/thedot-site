import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import MarkReportViewed from '../MarkReportViewed'
import styles from '../july-2026/report.module.css'

export const metadata = {
  title: 'Kanset August 2026 Performance Report | The Dot Creative',
  description: 'Kanset social media and website performance for August 2026.',
}

type Metric = {
  label: string
  before?: string
  after: string
  change: string
  tone?: 'positive' | 'neutral'
}

const socialMetrics: Metric[] = [
  { label: 'Facebook views', before: '6,059', after: '6,653', change: '+10%' },
  { label: 'Instagram views', before: '5,004', after: '3,494', change: '-30%', tone: 'neutral' },
  { label: 'YouTube views', before: '1,748', after: '1,473', change: '-16%', tone: 'neutral' },
  { label: 'LinkedIn impressions', before: '0', after: '375', change: 'first posting month' },
]

function MetricCell({ metric }: { metric: Metric }) {
  return (
    <div className={styles.metricCell}>
      <span className={styles.metricLabel}>{metric.label}</span>
      <span className={styles.metricValues}>
        {metric.before && <><span className={styles.before}>{metric.before}</span><span aria-hidden="true">→</span></>}
        <strong>{metric.after}</strong>
      </span>
      <span className={metric.tone === 'neutral' ? styles.neutral : styles.positive}>{metric.change}</span>
    </div>
  )
}

function ChannelCard({
  name,
  handle,
  children,
  note,
}: {
  name: string
  handle: string
  children: React.ReactNode
  note: string
}) {
  return (
    <article className={styles.channelCard}>
      <header className={styles.channelHead}>
        <strong>{name}</strong>
        <span>{handle}</span>
      </header>
      <div className={styles.channelBody}>{children}</div>
      <p className={styles.channelNote}>{note}</p>
    </article>
  )
}

function ChannelRow({ label, before, after, change }: { label: string; before: string; after: string; change: string }) {
  return (
    <div className={styles.channelRow}>
      <span>{label}</span>
      <span><small>{before}</small> → <strong>{after}</strong> <em>{change}</em></span>
    </div>
  )
}

export default async function AugustReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (slug !== 'kanset') notFound()

  return (
    <main className={styles.page}>
      <MarkReportViewed slug={slug} reportKey="2026-08" />
      <nav className={styles.back} aria-label="Report navigation">
        <Link href={`/client/${encodeURIComponent(slug)}/reports`}>← Performance reports</Link>
      </nav>

      <header className={styles.masthead}>
        <span>Kanset Immigration Services</span>
        <span>Performance · August 2026</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Month two review</p>
        <h1>August reached new people. The next job is turning that attention into a reason to return.</h1>
        <p className={styles.lede}>A full calendar-month read across Instagram, Facebook, YouTube, LinkedIn, and the website. The June figures below remain the documented pre-engagement baseline, not a like-for-like monthly export.</p>
      </section>

      <section className={styles.section} aria-labelledby="executive-summary">
        <h2 id="executive-summary">Executive Summary</h2>
        <div className={styles.summaryGrid}>
          <article>
            <h3>Facebook found more distinct people</h3>
            <p>Facebook reached <strong>3,324 people</strong>, up from about 2,700 in July, while views rose to 6,653. The content travelled further without paid promotion.</p>
          </article>
          <article>
            <h3>Format now has a clear platform split</h3>
            <p>On-camera video reached more people on Meta. LinkedIn documents drew more engagement than video. The same creative does not need to do the same job everywhere.</p>
          </article>
          <article>
            <h3>July was a launch-period high</h3>
            <p>August settled lower across views, reach, interactions, profile visits, and link taps. The existing Instagram follower core still supplied most of the engagement, so this reads as lower distribution after launch, not lost interest.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="social-overview">
        <h2 id="social-overview">Social media · July → August</h2>
        <div className={styles.metricGrid}>
          {socialMetrics.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
          <div className={styles.bridgeMetric}>
            <span>
              <span className={styles.metricLabel}>Website visits attributed to social</span>
              <span className={styles.bridgeRead}>19 → <strong>9</strong></span>
            </span>
            <span className={styles.neutral}>2.2% of August site visits</span>
          </div>
        </div>
        <p className={styles.context}>Platform totals are not interchangeable. Reach is a de-duplicated person count within each platform, while views count plays. This report compares each channel with its own July total.</p>
      </section>

      <section className={styles.section} aria-labelledby="channel-detail">
        <h2 id="channel-detail">Channel by channel</h2>
        <div className={styles.channelGrid}>
          <ChannelCard name="Instagram" handle="@kansetimmigration" note="The smaller follower base was the active one: 74 followers supplied 89% of interactions, although only 56 followers were reached during the month.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → August</span>
            <ChannelRow label="Followers" before="56" after="74" change="+18" />
            <ChannelRow label="Views" before="22" after="3,494" change="159×" />
            <span className={styles.subhead}>July → August</span>
            <ChannelRow label="Views" before="5,004" after="3,494" change="-30%" />
            <ChannelRow label="Interactions" before="290" after="192" change="-34%" />
          </ChannelCard>

          <ChannelCard name="Facebook" handle="/kansetimmigration" note="Recommendations accounted for 44% of watch time. The inherited follower base did not engage during the month, so reach is a more useful signal here than follower count.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → August</span>
            <ChannelRow label="Followers" before="959" after="961" change="+2" />
            <ChannelRow label="Views" before="117" after="6,653" change="57×" />
            <span className={styles.subhead}>July → August</span>
            <ChannelRow label="Reach" before="about 2,700" after="3,324" change="+23%" />
            <ChannelRow label="Interactions" before="215" after="234" change="+9%" />
          </ChannelCard>

          <ChannelCard name="YouTube" handle="Kanset Talks" note="July included the episode-one launch. August returned to the June baseline of two subscribers, rather than showing a channel collapse after a launch spike.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → August</span>
            <ChannelRow label="Subscribers gained" before="0" after="2" change="new channel baseline" />
            <ChannelRow label="Views" before="0" after="1,473" change="new" />
            <span className={styles.subhead}>July → August</span>
            <ChannelRow label="Views" before="1,748" after="1,473" change="-16%" />
            <ChannelRow label="Watch time" before="14.9 h" after="11.8 h" change="-21%" />
          </ChannelCard>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="linkedin-website">
        <h2 id="linkedin-website">LinkedIn and website</h2>
        <div className={styles.channelGrid}>
          <ChannelCard name="LinkedIn" handle="/kanset-services" note="This was a half-month launch: three weekly posts from August 12 to 26. The page already had 1,777 followers before posting began, so this is not from-zero growth.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-posting baseline → August</span>
            <ChannelRow label="Impressions" before="0" after="375" change="first month" />
            <ChannelRow label="New followers" before="0" after="3" change="first month" />
            <span className={styles.subhead}>What held attention</span>
            <ChannelRow label="Document engagement" before="n/a" after="12% to 29%" change="above video" />
            <ChannelRow label="Video engagement" before="n/a" after="6%" change="early read" />
          </ChannelCard>
          <ChannelCard name="Website" handle="kanset.com" note="The August article had seven views, but readers stayed an average of 2 minutes 53 seconds. It is early, but the small audience that arrived did read it.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>June baseline → August</span>
            <ChannelRow label="Visits" before="351" after="417" change="+19%" />
            <ChannelRow label="Contact-page views" before="99" after="118" change="+19%" />
            <span className={styles.subhead}>July → August</span>
            <ChannelRow label="Visits" before="499" after="417" change="-16%" />
            <ChannelRow label="Social referrals" before="19" after="9" change="-53%" />
          </ChannelCard>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="findings">
        <h2 id="findings">What the numbers say</h2>
        <div className={styles.findings}>
          <article className={styles.finding}>
            <h3>Keep the people on camera on Meta</h3>
            <p>Across August posts with at least 14 days to collect views, on-camera Instagram content averaged 126 reached accounts per post. Animated content averaged 75 and carousels averaged 29. Facebook retention pointed the same way: 17% for on-camera video versus 10% for animated video.</p>
            <p><strong>So what:</strong> keep putting the useful answer early in filmed cuts. Weekly roundups need a stronger opening, because their retention was consistently the lowest.</p>
          </article>
          <article className={styles.finding}>
            <h3>Move employer documents to LinkedIn</h3>
            <p>LinkedIn documents recorded 28.57% and 12.14% engagement, against 5.51% for the video post. A document-page advance counts as a click on LinkedIn, so those clicks are engagement with the document, not website traffic.</p>
            <p><strong>So what:</strong> use documents for employer material on LinkedIn and reels for the same idea on Meta.</p>
          </article>
          <article className={styles.finding}>
            <h3>Long-form needs a better promise on YouTube</h3>
            <p>Long-form thumbnail impressions rose 8%, while long-form views fell 49%. The channel was shown more often, but fewer people chose to watch. The introductory video had an 11.54% click-through rate, compared with 3.48% for episode 2 and 1.06% for episode 1.</p>
            <p><strong>So what:</strong> test clearer episode titles and thumbnail text before changing the publishing cadence.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="actions">
        <h2 id="actions">September actions</h2>
        <div className={styles.actions}>
          <article>
            <h3>Build for repeat attention</h3>
            <ul>
              <li>Keep on-camera answers as the lead Meta format.</li>
              <li>Put the answer or practical consequence in the first six seconds.</li>
              <li>Rework the weekly roundup opening before the next run.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: The Dot · Review: September month-end</p>
          </article>
          <article>
            <h3>Use each platform for its best job</h3>
            <ul>
              <li>Lead employer content with LinkedIn documents.</li>
              <li>Package the same subject as short video for Instagram and Facebook.</li>
              <li>Test stronger titles and thumbnails for full podcast episodes.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: The Dot · Review: September month-end</p>
          </article>
          <article className={styles.clientAction}>
            <h3>Close the consultation-source gap</h3>
            <ul>
              <li>Record how each consultation first heard about Kanset.</li>
              <li>Keep phone and message enquiries separate from public comments.</li>
              <li>Review the source list with the monthly report.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: Maria + reception · Review: September month-end</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="method">
        <h2 id="method">Method and limits</h2>
        <div className={styles.limits}>
          <article>
            <h3>How it was measured</h3>
            <ul>
              <li>Every account-level number comes from a native platform or website analytics view for August 1 to 31, 2026.</li>
              <li>Publication evidence comes from the portal’s verified destination records.</li>
              <li>Topic and format reads use individual post exports only. Per-post reach is never added together as an account total.</li>
              <li>LinkedIn launched mid-month, so its three posts are an early directional read.</li>
            </ul>
          </article>
          <article>
            <h3>What it cannot claim</h3>
            <ul>
              <li><strong>Direction, not proof.</strong> Small groups of posts cannot isolate topic from format.</li>
              <li><strong>The August crossover test did not run.</strong> Warm stories stayed on camera and dry compliance content stayed animated, so this report does not claim topic caused the format result.</li>
              <li><strong>No full consultation funnel yet.</strong> Social referrals, website actions, calls, and consultations are separate records.</li>
              <li><strong>Some dashboard fields remain unavailable.</strong> The snapshot cards identify each missing metric rather than estimating it.</li>
            </ul>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        The Dot Creative · August 2026 monthly review · Pulled September 1 to 2, 2026
      </footer>
    </main>
  )
}
