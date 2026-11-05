import Link from 'next/link'
import styles from '../july-2026/report.module.css'
import sept from '../september-2026/september.module.css'
import oct from './october.module.css'

const metrics = [
  ['Instagram views', '3,723', '4,102', '+10%'],
  ['Facebook views', '6,604', '5,203', '-21%'],
  ['YouTube views', '2,827', '4,466', '+58%'],
  ['LinkedIn impressions', '496', '686', '+38%'],
]
const channels = [
  { name: 'Instagram', rows: [['Viewers', '1,262', '1,353'], ['Interactions', '193', '249'], ['Profile visits', '132', '88']], note: 'More viewing and interaction. September profile visits included a surge after your event, so the fall in visits needs that context.' },
  { name: 'Facebook', rows: [['Viewers', '3,272', '2,809'], ['Interactions', '225', '139'], ['Messaging contacts', '3', '1']], note: 'Both viewing and interaction fell. The native measure is Viewers. Missing post detail limits what we can say about individual subjects and formats.' },
  { name: 'YouTube', rows: [['Unique viewers', '754', '1,433'], ['Hours watched', '7.0', '18.3'], ['Net new subscribers', '5', '4']], note: 'Views and total watch time grew. Net subscriber growth was slightly lower. Search brought 1,097 views, up from 765.' },
  { name: 'LinkedIn', rows: [['Content clicks', '121', '136'], ['Page views', '28', '88']], note: 'More visibility and content clicks, including document opens and page turns. No net follower growth or custom-button clicks were recorded.' },
  { name: 'Website', rows: [['Visits', '430', '472'], ['Form submissions', '17', '10'], ['Site button clicks', '41', '16']], note: 'More traffic coincided with fewer forms. These are site-wide actions, not bookings or consultations attributed to social media.' },
]

export default function OctoberReportBody({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <article className={`${styles.page} ${oct.wide} ${sept.lists}`}>
      <nav className={styles.back} aria-label="Report navigation"><Link href={backHref}>{backLabel}</Link></nav>
      <header className={styles.masthead}><span>Kanset Immigration Services</span><span>Performance · October 2026</span></header>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Month four review</p>
        <h1>October brought more video viewing, but fewer website form submissions.</h1>
      </section>
      <section className={styles.section} aria-labelledby="oct-glance">
        <h2 id="oct-glance">October at a glance</h2>
        <div className={styles.summaryGrid}>
          <article><h3>YouTube grew most</h3><ul><li>Views rose 58% to <strong>4,466</strong></li><li>18.3 hours watched, up from 7.0</li><li>1,097 views came through YouTube search</li></ul></article>
          <article><h3>Instagram rose, Facebook fell</h3><ul><li>Instagram views +10%, interactions +29%</li><li>Facebook views -21%, interactions -38%</li><li>The unusual final week needs a separate reading</li></ul></article>
          <article><h3>More visits, fewer forms</h3><ul><li>Website visits 430 → <strong>472</strong></li><li>Form submissions 17 → <strong>10</strong></li><li>Visits from social media 8 → 19</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-channels">
        <h2 id="oct-channels">Your channels · September → October</h2>
        <div className={styles.metricGrid}>
          {metrics.map(([label, before, after, change]) => <div className={styles.metricCell} key={label}>
            <span className={styles.metricLabel}>{label}</span>
            <span className={styles.metricValues}><span className={styles.before}>{before}</span><span aria-hidden="true">→</span><strong>{after}</strong></span>
            <span className={change.startsWith('-') ? styles.neutral : styles.positive}>{change}</span>
          </div>)}
          <div className={styles.bridgeMetric}><span><span className={styles.metricLabel}>Website visits from social media</span><span className={styles.bridgeRead}>8 → <strong>19</strong></span></span><span className={styles.neutral}>Facebook 17 · Instagram 2</span></div>
        </div>
        <div className={`${styles.channelGrid} ${sept.gapTop}`}>
          {channels.map(channel => <article className={styles.channelCard} key={channel.name}>
            <header className={styles.channelHead}><strong>{channel.name}</strong></header>
            <div className={styles.channelBody}>{channel.rows.map(([label, before, after]) => <div className={styles.channelRow} key={label}><span>{label}</span><span><small>{before}</small> → <strong>{after}</strong></span></div>)}</div>
            <p className={styles.channelNote}>{channel.note}</p>
          </article>)}
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-week">
        <h2 id="oct-week">The final week needs its own reading</h2>
        <p className={styles.pathIntro}>The last week followed a different posting rhythm. It stays in the full-month totals, but it should not be treated as an ordinary week when judging topics or formats.</p>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}>
            <h3>Social viewing was lower</h3>
            <table className={oct.weekTable}><caption>Account views, matched Monday-to-Friday periods</caption><thead><tr><th scope="col">Platform</th><th scope="col">Oct 19–23</th><th scope="col">Oct 26–30</th></tr></thead><tbody>
              <tr><th scope="row">Instagram</th><td>1,325</td><td>633 <small>(-52%)</small></td></tr>
              <tr><th scope="row">Facebook</th><td>1,447</td><td>705 <small>(-51%)</small></td></tr>
              <tr><th scope="row">YouTube</th><td>850</td><td>251 <small>(-70%)</small></td></tr>
            </tbody></table>
            <p>October 19–23 was the strongest full weekday week on Instagram and Facebook. Instagram’s final week still exceeded October 5–9 (591 views). These account totals include older posts and do not isolate the effects of posting frequency, content mix or distribution.</p>
          </article>
          <article className={styles.finding}><h3>Website activity moved differently</h3><ul><li>October 25–31: <strong>124 visits</strong>, including 11 from social sources</li><li>October 18–24: 109 visits, none attributed to social</li><li>The final week had October&apos;s highest website visits</li></ul><p>These are the website&apos;s Sunday-to-Saturday weeks, a separate comparison. The final week was not uniformly weaker.</p></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-findings">
        <h2 id="oct-findings">What stood out</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>Shorts brought views; the episode brought watch time</h3><ul><li>The Niagara Falls clip and &ldquo;Moving to Canada: my top 3 reasons&rdquo; contributed <strong>1,967 views</strong>, 44% of YouTube&apos;s total. That shows where viewing concentrated, rather than proving a winning subject.</li><li><strong>Episode 4 supplied 6.8 hours</strong>, 37% of the channel&apos;s watch time during October.</li><li>YouTube search brought 1,097 views, up from 765. The Shorts feed remained larger, at 2,979 views.</li></ul></article>
          <article className={styles.finding}><h3>Employer documents and website articles kept being used</h3><ul><li>The two October employer documents on LinkedIn had 24 and 36 lifetime clicks by November 5, compared with 8 for the episode-launch video. The posts have different ages, so this is not a controlled format test.</li><li>The new episode article received 10 pageviews. The September article received 14 and August&apos;s received 11 during October.</li><li>Website contact-page views fell from 105 to 97.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-follow-through">
        <h2 id="oct-follow-through">Following up on September</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>A quicker episode opening</h3><ul><li>Episode 4 reaches its topic at 0:11 and its first question at 0:26, so it kept its recorded opening.</li><li>The opening teaser was approved on October 6 for episodes that need it. Episode 5 is the next planned use; October did not test its effect.</li></ul></article>
          <article className={styles.finding}><h3>Clearer covers</h3><p>Three Episode 4 cover variants were prepared, including closer portraits. The native YouTube test result was not captured in this review, so there is no cover winner to report.</p></article>
          <article className={styles.finding}><h3>The two longer YouTube cuts</h3><ul><li>Published October 7 and 13, at 4:33 and 6:20, rather than both within the suggested 5–10 minutes.</li><li>They received 45 and 20 October views. Those are unequal-age calendar-month figures, not the promised 28-day test.</li><li>The first 28-day read is outstanding; the second is due November 10. The experiment has no verdict yet.</li></ul></article>
          <article className={styles.finding}><h3>Personal sharing at launch</h3><p>Personal sharing was suggested, but it was not verified in this review. October&apos;s viewing cannot be attributed to that suggestion.</p></article>
          <article className={styles.finding}><h3>New filmed employer answers</h3><p>A new batch was suggested for the next shoot. Its delivery in October is not verified, so it remains an open suggestion. LinkedIn employer documents continued; they do not replace that filming request.</p></article>
          <article className={styles.finding}><h3>The measurement still owed</h3><ul><li>The episode-link route and cover tests need their own results; channel-wide growth does not measure them.</li><li>The October posting-time test cannot be scored from the current account totals and incomplete Meta post detail.</li><li>The booking-source field and completed-consultation count remain unverified. Website forms do not close that gap.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-forward">
        <h2 id="oct-forward">What to carry forward</h2>
        <div className={styles.summaryGrid}>
          <article><h3>Keep the existing practices</h3><p>Employer documents on LinkedIn and searchable process titles on YouTube remain useful. October supports continuing them.</p></article>
          <article><h3>Keep the final week in context</h3><p>Retain the full month and its separate week comparison. Missing Meta post detail makes this a poor month to reset the topic or format mix.</p></article>
          <article><h3>Watch the step after viewing</h3><p>Read website forms alongside visibility. The current data cannot identify how many social viewers became qualified inquiries or consultations.</p></article>
        </div>
      </section>
      <footer className={styles.footer}>Numbers from each platform&apos;s own analytics, September 1–30 and October 1–31, 2026, collected November 5. October has one more day. Meta post exports were unavailable, so no new Instagram or Facebook topic, format or retention verdict is made. October-end follower stocks were not captured; current November counts are not substituted. The Dot Creative · October 2026 monthly review</footer>
    </article>
  )
}
