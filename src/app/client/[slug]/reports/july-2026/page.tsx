import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getClientSession } from '@/lib/portal/auth'
import styles from './report.module.css'

export const metadata = {
  title: 'Kanset July 2026 Performance Report | The Dot Creative',
  description: 'Kanset social media and website performance for July 2026.',
}

type Metric = {
  label: string
  before?: string
  after: string
  change: string
  tone?: 'positive' | 'neutral'
}

const socialMetrics: Metric[] = [
  { label: 'Views across all channels', before: '139', after: '12,811', change: '92× the baseline' },
  { label: 'Interactions', before: '3', after: '570', change: '190× the baseline' },
  { label: 'Social content pieces', before: '0', after: '20', change: 'published in July' },
  { label: 'Net audience growth', after: '+36', change: '15 IG · 1 FB · 20 YT' },
]

const websiteMetrics: Metric[] = [
  { label: 'Visits', before: '351', after: '499', change: '+42%' },
  { label: 'Unique visitors', before: '323', after: '459', change: '+42%' },
  { label: 'Pageviews', before: '655', after: '944', change: '+44%' },
  { label: 'Contact-page views', before: '99', after: '140', change: '+41%' },
  { label: 'Form submissions', before: '6', after: '11', change: '+83%' },
  { label: 'Site button clicks', before: '26', after: '38', change: '+46%' },
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

export default async function JulyReport({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await getClientSession(slug)
  if (!session) redirect('/client/login')
  if (slug !== 'kanset') notFound()

  return (
    <main className={styles.page}>
      <nav className={styles.back} aria-label="Report navigation">
        <Link href={`/client/${encodeURIComponent(slug)}/reports`}>← Performance reports</Link>
      </nav>

      <header className={styles.masthead}>
        <span>Kanset Immigration Services</span>
        <span>Performance · July 2026</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Month one review</p>
        <h1>July built the audience. August needs to connect attention to consultations.</h1>
        <p className={styles.lede}>Kanset’s first full month of managed content, measured against the June baseline. Instagram and Facebook were effectively inactive before July, and Kanset Talks was new.</p>
      </section>

      <section className={styles.section} aria-labelledby="executive-summary">
        <h2 id="executive-summary">Executive Summary</h2>
        <div className={styles.summaryGrid}>
          <article>
            <h3>Attention grew from a near-silent baseline</h3>
            <p><strong>12,811 views</strong> across Instagram, Facebook, and YouTube in July, against a documented pre-launch floor of 139. This establishes the first useful month-one baseline.</p>
          </article>
          <article>
            <h3>The website moved with it</h3>
            <p>Visits rose <strong>42%</strong>, contact-page views rose <strong>41%</strong>, and form submissions moved from 6 to 11. Social referrals rose from 3 to 19, but remain too small to explain the wider site growth.</p>
          </article>
          <article>
            <h3>The creative direction is clearer</h3>
            <p>On-camera video beat animated reels on all three platforms, and most viewers gave a clip about six seconds. August should test warmer animated topics and keep filmed cuts tight before the scope changes permanently.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="social-overview">
        <h2 id="social-overview">Social media · June baseline → July</h2>
        <div className={styles.metricGrid}>
          {socialMetrics.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
          <div className={styles.bridgeMetric}>
            <span>
              <span className={styles.metricLabel}>Website visits attributed to social</span>
              <span className={styles.bridgeRead}>3 → <strong>19</strong></span>
            </span>
            <span className={styles.positive}>6.3× · 0.9% → 3.8% of site visits</span>
          </div>
        </div>
        <p className={styles.context}>The June comparison is a documented native baseline, not a like-for-like monthly export for social. Platform definitions also differ, so the total is useful as a scale marker, not as a cross-platform efficiency score.</p>
      </section>

      <section className={styles.section} aria-labelledby="channel-detail">
        <h2 id="channel-detail">Channel by channel</h2>
        <div className={styles.channelGrid}>
          <ChannelCard name="Instagram" handle="@kansetimmigration" note="Two thirds of H2 views came from people who did not follow Kanset yet, up from 61% in H1.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → July</span>
            <ChannelRow label="Followers" before="56" after="71" change="+27%" />
            <ChannelRow label="Views" before="22" after="5,004" change="227×" />
            <span className={styles.subhead}>Jul 1–15 → Jul 16–31</span>
            <ChannelRow label="Reach" before="776" after="1,232" change="+59%" />
            <ChannelRow label="Interactions" before="130" after="148" change="+14%" />
          </ChannelCard>

          <ChannelCard name="Facebook" handle="/kansetimmigration" note="The H2 increase reflects 9 active posting days in H1 against 16 in H2. Views per active day moved only 4%, from 236 to 246.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → July</span>
            <ChannelRow label="Followers" before="959" after="960" change="+1" />
            <ChannelRow label="Views" before="117" after="6,059" change="52×" />
            <span className={styles.subhead}>Jul 1–15 → Jul 16–31</span>
            <ChannelRow label="Views" before="2,123" after="3,936" change="+85%" />
            <ChannelRow label="Interactions" before="77" after="138" change="+79%" />
          </ChannelCard>

          <ChannelCard name="YouTube" handle="Kanset Talks" note="In H2, episode 1 brought 7 of 10 new subscribers and 84% of watch time from 126 views.">
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Pre-engagement baseline → July</span>
            <ChannelRow label="Subscribers" before="0" after="20" change="new" />
            <ChannelRow label="Views" before="0" after="1,748" change="new" />
            <span className={styles.subhead}>Jul 1–15 → Jul 16–31</span>
            <ChannelRow label="Views" before="716" after="1,032" change="+44%" />
            <ChannelRow label="Watch time" before="2.8 h" after="12.2 h" change="+343%" />
          </ChannelCard>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="website-overview">
        <h2 id="website-overview">Website · pre-engagement baseline → July</h2>
        <div className={`${styles.metricGrid} ${styles.websiteGrid}`}>
          {websiteMetrics.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
        </div>
        <p className={styles.context}>The contact page was the second most-viewed page in both July halves, with average time on page above two minutes. The first two articles drew 11 and 8 views in their opening reporting windows. That is too early to judge search value, which builds over months.</p>
      </section>

      <section className={styles.section} aria-labelledby="measurement-path">
        <h2 id="measurement-path">From attention to a booked consultation</h2>
        <p className={styles.pathIntro}>A measurement path, not a tracked conversion funnel. Each row is a separate platform total, shown as June → July.</p>
        <div className={styles.stagePath} role="list" aria-label="Measurement path from social attention to consultation booking">
          <article className={styles.stage} data-width="1" role="listitem">
            <div>
              <h3>Social views across all three channels</h3>
              <p>Documented baseline floor across native platform totals. Views are not people.</p>
            </div>
            <div className={styles.stageResult}><span>139</span><span aria-hidden="true">→</span><strong>12,811</strong><em>92×</em></div>
          </article>
          <article className={styles.stage} data-width="2" role="listitem">
            <div>
              <h3>Website visits</h3>
              <p>Of these, visits attributed to social moved from 3 to 19.</p>
            </div>
            <div className={styles.stageResult}><span>351</span><span aria-hidden="true">→</span><strong>499</strong><em>+42%</em></div>
          </article>
          <article className={styles.stage} data-width="3" role="listitem">
            <div>
              <h3>Contact-page views</h3>
              <p>Pageviews, not unique people. Average time on page was above two minutes in July.</p>
            </div>
            <div className={styles.stageResult}><span>99</span><span aria-hidden="true">→</span><strong>140</strong><em>+41%</em></div>
          </article>
          <article className={styles.stage} data-width="4" role="listitem">
            <div>
              <h3>Website action signals</h3>
              <p>Separate event totals that may overlap. Button clicks include all site buttons, not only booking.</p>
            </div>
            <div className={styles.signalResults}>
              <span>Forms <b>6 → 11</b> <em>+83%</em></span>
              <span>Button clicks <b>26 → 38</b> <em>+46%</em></span>
            </div>
          </article>
          <article className={`${styles.stage} ${styles.stageGap}`} data-width="5" role="listitem">
            <div>
              <h3>Consultations booked</h3>
              <p>Add a required source field when the consultation is booked.</p>
            </div>
            <strong>Not recorded</strong>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="findings">
        <h2 id="findings">What the numbers say</h2>
        <div className={styles.findings}>
          <article className={styles.finding}>
            <h3>On-camera video earned more distribution</h3>
            <p>The second-half cohort points in the same direction on all three platforms. The groups are small, and the animated pieces carried drier employer-compliance topics, so August should test the format before changing the scope.</p>
            <div className={styles.evidenceTable} role="table" aria-label="On-camera and animated content comparison">
              <div className={styles.evidenceHead} role="row"><span role="columnheader">Platform</span><span role="columnheader">On camera</span><span role="columnheader">Animated</span></div>
              <div role="row"><span role="cell">Facebook average reach</span><strong role="cell">337</strong><span role="cell">79</span></div>
              <div role="row"><span role="cell">Instagram average reach</span><strong role="cell">187</strong><span role="cell">104</span></div>
              <div role="row"><span role="cell">YouTube average views</span><strong role="cell">144</strong><span role="cell">49</span></div>
            </div>
            <p><strong>So what:</strong> use one warm, story-led animated reel and one dry on-camera answer in August to separate topic from format.</p>
          </article>

          <article className={styles.finding}>
            <h3>Viewers gave a clip about six seconds</h3>
            <p>Facebook clips ranged from 13 to 72 seconds, but average watch time stayed near 6.22 seconds. YouTube Shorts independently landed at 6.23 seconds. Clips over a minute did not earn more watch time, only a lower completion rate.</p>
            <p><strong>So what:</strong> put the useful answer in the first six seconds and keep talking-head cuts to roughly 15 to 40 seconds.</p>
          </article>

          <article className={styles.finding}>
            <h3>YouTube has two different jobs</h3>
            <p>In H2, Shorts supplied 85% of views but only 12% of watch time. Long-form supplied 14% of views, 87% of watch time, and 7 of the 10 new subscribers from episode 1 alone.</p>
            <p><strong>So what:</strong> keep Shorts as discovery, then point them toward the full episode. The podcast is the channel’s depth and subscriber engine.</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="actions">
        <h2 id="actions">August actions</h2>
        <div className={styles.actions}>
          <article>
            <h3>Use carousels more selectively</h3>
            <ul>
              <li>Across 40 comparable Meta post records, photo and carousel posts averaged 37 accounts reached against 207 for video.</li>
              <li>Keep carousels for information people may need to revisit, and test one additional video-led slot before changing the standing mix.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: The Dot · Review: late August</p>
          </article>
          <article>
            <h3>More on camera, tighter cuts</h3>
            <ul>
              <li>Keep talking-head cuts to roughly 15 to 40 seconds.</li>
              <li>Put the useful answer inside the first six seconds.</li>
              <li>Run the topic-versus-format test before making this a permanent rule.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: The Dot · Review: late August</p>
          </article>
          <article className={styles.clientAction}>
            <h3>Close the attribution gap</h3>
            <ul>
              <li>Create a shared Microsoft Bookings service for initial consultations.</li>
              <li>Add “How did you first hear about Kanset?” as a required single-choice field.</li>
              <li>Have reception record the answer with every appointment, then export consultation sources monthly.</li>
              <li>Test one staff-created booking first. Microsoft documents the required field for client bookings, but does not explicitly confirm that staff-created bookings enforce it.</li>
            </ul>
            <p className={styles.actionMeta}>Owner: Maria + reception · Review: late August</p>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="method">
        <h2 id="method">Method and limits</h2>
        <div className={styles.limits}>
          <article>
            <h3>How it was measured</h3>
            <ul>
              <li>Every number traces to Instagram Insights, Meta Business Suite, YouTube Studio, Squarespace, or the portal’s verified publication record.</li>
              <li>Additive totals were recalculated from native exports where the platform exposed them.</li>
              <li>Format analysis covers 40 comparable Meta post records. It excludes the duplicate Facebook share and the single link post, and is not a count of unique content pieces.</li>
              <li>The June social figure is the documented pre-launch floor, not a like-for-like monthly export.</li>
            </ul>
          </article>
          <article>
            <h3>What it cannot claim</h3>
            <ul>
              <li><strong>Before and after, not proof of cause.</strong> One month cannot isolate what caused the change.</li>
              <li><strong>Small volumes.</strong> Eleven forms is eleven. A few events is not a trend.</li>
              <li><strong>No linked funnel.</strong> Forms, button clicks, and social referrals are separate platform totals and may overlap.</li>
              <li><strong>Growth skews international.</strong> Canadian visits rose 13%, while visits from elsewhere rose 75%.</li>
            </ul>
          </article>
        </div>
      </section>

      <footer className={styles.footer}>
        The Dot Creative · Snapshot published 4 August 2026 · July 2026 against the June 2026 baseline
      </footer>
    </main>
  )
}
