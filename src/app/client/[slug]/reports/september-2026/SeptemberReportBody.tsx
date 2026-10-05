import Link from 'next/link'
import styles from '../july-2026/report.module.css'
import sept from './september.module.css'

type Metric = {
  label: string
  before?: string
  after: string
  change: string
  tone?: 'positive' | 'neutral'
}

const socialMetrics: Metric[] = [
  { label: 'Facebook views', before: '6,653', after: '6,604', change: '-1%', tone: 'neutral' },
  { label: 'Instagram views', before: '3,494', after: '3,723', change: '+7%' },
  { label: 'YouTube views', before: '1,473', after: '2,827', change: '+92%' },
  { label: 'LinkedIn impressions', before: '375', after: '496', change: '+32%' },
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

// The September 2026 report body, shared by the gated client route and the agency draft preview.
// Restructured 2026-10-01 to Maria's own feedback on the August report (ideas board, 2026-09-08):
// point form, shorter, channel overview merged with channel detail, topics merged with findings,
// no platform mechanics, no agency action list, no "method and limits" section.
export default function SeptemberReportBody({ backHref, backLabel, feedback }: { backHref: string; backLabel: string; feedback?: React.ReactNode }) {
  return (
    <main className={`${styles.page} ${sept.wide} ${sept.lists}`}>
      <nav className={styles.back} aria-label="Report navigation">
        <Link href={backHref}>{backLabel}</Link>
      </nav>

      <header className={styles.masthead}>
        <span>Kanset Immigration Services</span>
        <span>Performance · September 2026</span>
      </header>

      <section className={styles.hero}>
        <p className={styles.eyebrow}>Month three review</p>
        <h1>September: more people found Kanset on YouTube and Instagram, and they stop for you and Mary on camera.</h1>
      </section>

      <section className={styles.section} aria-labelledby="at-a-glance">
        <h2 id="at-a-glance">September at a glance</h2>
        <div className={styles.summaryGrid}>
          <article>
            <h3>YouTube nearly doubled</h3>
            <ul>
              <li>Views 1,473 → <strong>2,827</strong></li>
              <li>Unique viewers 257 → 754</li>
              <li>765 views came from people searching YouTube</li>
            </ul>
          </article>
          <article>
            <h3>Filmed and animated each had a job</h3>
            <ul>
              <li>Your filmed answers: about 3× the views of animated reels on Instagram and Facebook</li>
              <li>Animated news reels: as many YouTube views as filmed clips, found through search</li>
              <li>The two &ldquo;three things I love&rdquo; clips were top everywhere</li>
            </ul>
          </article>
          <article>
            <h3>Instagram grew</h3>
            <ul>
              <li>Followers 74 → <strong>93</strong></li>
              <li>Much of it on September 24 and 25, after your event</li>
              <li>Website form submissions 14 → 17</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="channels">
        <h2 id="channels">Your channels · August → September</h2>
        <div className={styles.metricGrid}>
          {socialMetrics.map((metric) => <MetricCell key={metric.label} metric={metric} />)}
          <div className={styles.bridgeMetric}>
            <span>
              <span className={styles.metricLabel}>Website visits from social media</span>
              <span className={styles.bridgeRead}>9 → <strong>8</strong></span>
            </span>
            <span className={styles.neutral}>still small</span>
          </div>
        </div>
        <div className={`${styles.channelGrid} ${sept.gapTop}`}>
          <ChannelCard name="Instagram" handle="@kansetimmigration" note="The follower jump came mostly after your September 24 event, not from a post.">
            <ChannelRow label="Followers" before="74" after="93" change="+19" />
            <ChannelRow label="Profile visits" before="84" after="132" change="+57%" />
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Before we started → now</span>
            <ChannelRow label="Followers" before="56" after="93" change="+37" />
          </ChannelCard>
          <ChannelCard name="Facebook" handle="/kansetimmigration" note="Views held steady and comments grew. Almost all of it came from people who do not follow the Page.">
            <ChannelRow label="People reached" before="3,324" after="3,272" change="level" />
            <ChannelRow label="Comments on posts" before="10" after="25" change="+15" />
            <ChannelRow label="Messages to the Page" before="0" after="3" change="+3" />
          </ChannelCard>
          <ChannelCard name="YouTube" handle="Kanset Talks" note="Two personal clips brought 42% of the views. Without them, YouTube still grew about 12%.">
            <ChannelRow label="Unique viewers" before="257" after="754" change="about 3×" />
            <ChannelRow label="New subscribers" before="2" after="6" change="+4" />
            <span className={`${styles.subhead} ${styles.baselineHead}`}>Before we started → now</span>
            <ChannelRow label="Subscribers" before="0" after="27" change="new channel" />
          </ChannelCard>
        </div>
        <div className={`${styles.channelGrid} ${sept.gapTop}`}>
          <ChannelCard name="LinkedIn" handle="/kanset-services" note="The three employer guides posted as documents drew 26 to 59 clicks each, against 5 and 1 for the two videos.">
            <ChannelRow label="Impressions" before="375" after="496" change="+32%" />
            <ChannelRow label="Comments" before="0" after="3" change="+3" />
          </ChannelCard>
          <ChannelCard name="Website" handle="kanset.com" note="The Episode 1 and 2 articles are still being read.">
            <ChannelRow label="Visits" before="417" after="430" change="+3%" />
            <ChannelRow label="Form submissions" before="14" after="17" change="+3" />
            <span className={`${styles.subhead} ${styles.baselineHead}`}>June → now</span>
            <ChannelRow label="Form submissions" before="6" after="17" change="+11" />
          </ChannelCard>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="what-worked">
        <h2 id="what-worked">What worked, and where the next gains are</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}>
            <h3>Worked</h3>
            <ul>
              <li><strong>You on camera.</strong> A typical filmed answer drew 210 views on Instagram, an animated reel 62. On Facebook, 423 against 151. August showed the same pattern.</li>
              <li><strong>Animated news on YouTube and Facebook.</strong> On YouTube, animated reels did as well as filmed clips, mostly through search: the September 28 roundup had 200 views and the H&amp;C instructions reel the highest click rate of the month. On Facebook, the reduction-plan reel (248 people), the September 28 roundup (222) and the closed work permit reel (200) beat half of the filmed clips.</li>
              <li><strong>Personal moments.</strong> &ldquo;Three things I love&rdquo; about Canada and about the work led on Instagram, Facebook and YouTube.</li>
              <li><strong>H&amp;C on camera.</strong> Your two H&amp;C answers drew 213 and 244 views on Instagram, 660 and 462 on Facebook.</li>
              <li><strong>Searchable YouTube titles.</strong> Titles starting with the process people look up, such as OINP or work permit extensions, were found through search.</li>
              <li><strong>LinkedIn documents</strong> for employer guides, for the second month.</li>
            </ul>
          </article>
          <article className={styles.finding}>
            <h3>Where the next gains are</h3>
            <ul>
              <li><strong>Instagram responds most to you on camera.</strong> There, your filmed answers drew about three times the views of animated reels. Tuesdays and Thursdays keep your answers front and centre.</li>
              <li><strong>Employer topics are waiting for your voice.</strong> In August, your filmed employer answers were among the strongest posts. In September there were none left to use, so employer topics ran as animation. A few new employer answers would bring them back (suggestion 6).</li>
              <li><strong>From viewers to visitors.</strong> Website form submissions rose from 14 to 17, and only a handful of site visits came straight from social. As more people get to know Kanset through the posts, this is the number I will watch.</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="kanset-talks">
        <h2 id="kanset-talks">Kanset Talks: what three episodes tell us</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}>
            <h3>Good news</h3>
            <ul>
              <li><strong>YouTube is recommending the podcast more each month.</strong> Episode 3 was shown to new viewers 1,388 times in its first two weeks, four times as often as Episode 1.</li>
              <li><strong>People who know you watch for a long time.</strong> Viewers who came from a notification or a playlist stayed 13 to 22 minutes.</li>
            </ul>
          </article>
          <article className={styles.finding}>
            <h3>Where the next gains are</h3>
            <ul>
              <li><strong>Holding the new viewers YouTube sends.</strong> Those who found Episode 3 this way stayed under two minutes on average. A quicker start and a clearer cover are made for exactly them (suggestions 1 to 3).</li>
              <li><strong>Your own network is the best launch.</strong> Episode 1 had the strongest start because people who know you came to watch: 80 of its first 112 views came through shared links, and it brought 7 subscribers. Episodes 2 and 3 had about 20 such views each, so personal sharing is the easiest gain (suggestion 4).</li>
            </ul>
          </article>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="suggestions">
        <h2 id="suggestions">Six suggestions for you</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}>
            <h3>For the next episodes</h3>
            <ol>
              <li><strong>A shorter greeting.</strong> On Episode 3 the first real point came after about two minutes of welcome. A short hello, then straight into the topic.</li>
              <li><strong>The teaser at the very start.</strong> The same teaser I make for Instagram and Facebook, placed before the hellos on YouTube. The rest stays exactly as recorded. Two episodes are enough to compare.</li>
              <li><strong>A clearer YouTube cover.</strong> A close-up of you or Mary instead of the whole studio, since on a phone the cover is stamp-sized. And three or four words instead of the full title, which already sits under the cover. Two quick close-up photos at the next shoot would do it.</li>
              <li><strong>Share each new episode yourself in launch week,</strong> with clients, contacts and on your own LinkedIn. That is what gave Episode 1 its start.</li>
              <li><strong>Two longer clips, as an experiment.</strong> 5 to 10 minutes each, from Episode 3 or 4, each answering one question, to see if people searching YouTube find them.</li>
            </ol>
          </article>
          <article className={styles.finding}>
            <h3>For the next shoot</h3>
            <ol start={6}>
              <li><strong>Three or four short employer answers.</strong> In August, your answers on promoting a foreign worker, layoffs and unpaid leave were among the strongest posts on Instagram and Facebook, and I have no filmed employer answers left. If you want, I will send a list of questions to choose from.</li>
            </ol>
          </article>
        </div>
      </section>

      {feedback}

      <footer className={styles.footer}>
        Numbers from each platform&apos;s own analytics, September 1 to 30, 2026. The Dot Creative · September 2026 monthly review
      </footer>
    </main>
  )
}
