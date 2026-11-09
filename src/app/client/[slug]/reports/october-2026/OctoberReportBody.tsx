import Link from 'next/link'
import styles from '../july-2026/report.module.css'
import sept from '../september-2026/september.module.css'
import oct from './october.module.css'

const metrics = [
  ['Instagram views', '3,723', '4,102', '+10%'],
  ['Facebook views', '6,604', '5,203', '-21%'],
  ['YouTube views', '2,804', '4,466', '+59%'],
  ['LinkedIn impressions', '496', '686', '+38%'],
]
const channels = [
  { name: 'Instagram', rows: [['Viewers', '1,262', '1,353'], ['Interactions', '193', '249'], ['Profile visits', '132', '88']], note: 'More viewing and interaction. September profile visits included a surge after your event, so the fall in visits needs that context.' },
  { name: 'Facebook', rows: [['Viewers', '3,272', '2,809'], ['Interactions', '225', '139'], ['Messaging contacts', '3', '1']], note: 'Both viewing and interaction fell. Reels supplied 4,916 of the 5,203 views. The recovered post export supports the descriptive comparison below.' },
  { name: 'YouTube', rows: [['Unique viewers', '768', '1,433'], ['Hours watched', '7.0', '18.3'], ['Net new subscribers', '5', '4']], note: 'Views and total watch time grew. Net subscriber growth was slightly lower. Search brought 1,097 views, up from 761.' },
  { name: 'LinkedIn', rows: [['Content clicks', '121', '136'], ['Page views', '28', '88'], ['Unique visitors', '13', '21']], note: 'More visibility and content clicks, including document opens and page turns. No net follower growth or custom-button clicks were recorded.' },
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
          <article><h3>YouTube grew most</h3><ul><li>Views rose 59% to <strong>4,466</strong></li><li>18.3 hours watched, up from 7.0</li><li>1,097 views came through YouTube search</li></ul></article>
          <article><h3>Instagram rose, Facebook fell</h3><ul><li>Instagram views +10%, interactions +29%</li><li>Facebook views -21%, interactions -38%</li><li>Posting was less regular in the final week, which may have affected social performance.</li></ul></article>
          <article><h3>More visits, fewer forms</h3><ul><li>Website visits 430 → <strong>472</strong></li><li>Form submissions 17 → <strong>10</strong></li><li>Visits from social media 8 → 19</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-channels">
        <h2 id="oct-channels">Your channels · September → October</h2>
        <p className={styles.pathIntro}>September 1–30 → October 1–31, 2026. Each figure covers activity across the account during that calendar month, including activity on older content. These are monthly totals; October has one more day.</p>
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
        <h2 id="oct-week">Posting changed in the final week</h2>
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
      <section className={styles.section} aria-labelledby="oct-formats">
        <h2 id="oct-formats">Filmed answers kept their role</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>More views per filmed Reel</h3><ul><li>Instagram median views: <strong>190 filmed · 69 graphic</strong></li><li>Facebook median views: <strong>376 filmed · 63.5 graphic</strong></li><li>Seven filmed and eight graphic Reels per platform, all published by October 21.</li></ul></article>
          <article className={styles.finding}><h3>A reason to keep the approach</h3><p>These are lifetime views captured November 5, with every included post at least 15 calendar days old. Ages and subjects still differ. The pattern supports continuing filmed answers, rather than proving that filming alone caused the difference. Two static posts are too few to reset the reference-post role.</p></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-findings">
        <h2 id="oct-findings">What stood out</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>Shorts brought views; the episode brought watch time</h3><ul><li>The Niagara Falls clip and &ldquo;Moving to Canada: my top 3 reasons&rdquo; contributed <strong>1,967 views</strong>, 44% of YouTube&apos;s total. That shows where viewing concentrated, rather than proving a winning subject.</li><li><strong>Episode 4 supplied 6.8 hours</strong>, 37% of the channel&apos;s watch time during October.</li><li>YouTube search brought 1,097 views, up from 761. The Shorts feed remained larger, at 2,979 views.</li></ul></article>
          <article className={styles.finding}><h3>Employer documents and website articles kept being used</h3><ul><li>The two October employer documents on LinkedIn had 24 and 36 lifetime clicks by November 5, compared with 8 for the episode-launch video. The posts have different ages, so this is not a controlled format test.</li><li>The new episode article received 10 pageviews. The September article received 14 and August&apos;s received 11 during October.</li><li>Website contact-page views fell from 105 to 97.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-follow-through">
        <h2 id="oct-follow-through">Following up on September</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>A quicker episode opening</h3><ul><li>Episode 4 reaches its topic at 0:11 and its first question at 0:26, so it kept its recorded opening.</li><li>An added opening teaser was approved on October 6, but October did not test its effect. Under the November 8 decision, Episode 5 keeps its recorded opening; future added openings need an explicit decision for that episode.</li></ul></article>
          <article className={styles.finding}><h3>Clearer covers</h3><p>The three Episode 4 covers ran in YouTube’s test from October 15 to 29. YouTube reported too few impressions to declare a winner. The original cover remains in use; there is no evidence yet to choose a new cover style.</p></article>
          <article className={styles.finding}><h3>The two longer YouTube cuts</h3><ul><li>Published October 7 and 13, at 4:33 and 6:20, rather than both within the suggested 5–10 minutes.</li><li>The first cut’s first 28 calendar days brought 47 views, including 14 from search, and net growth of one subscriber. YouTube’s average view was 56 seconds on a 4:33 video.</li><li>The second cut reaches its 28-day review on November 10. The first result is small; wait for both before deciding whether to repeat the format.</li></ul></article>
          <article className={styles.finding}><h3>Personal sharing at launch</h3><p>Personal sharing was suggested, but it was not verified in this review. October&apos;s viewing cannot be attributed to that suggestion.</p></article>
          <article className={styles.finding}><h3>New filmed employer answers</h3><p>A new Set 6 employer answer, about OINP requirements for multiple workers, was published October 27. The source includes two versions of that same question, not two distinct answers. This is progress, but it does not establish completion of the suggested three or four different employer answers.</p></article>
          <article className={styles.finding}><h3>Episode follow-up cuts</h3><p>Episode 4 had two follow-up cuts in October, on October 20 and 23. The third fell into November, so the target of three or four cuts within days 2–10 was not completed. Episode 3’s October cuts were also late relative to its September 17 launch.</p></article>
          <article className={styles.finding}><h3>Test results and remaining gaps</h3><ul><li>Episode 3’s first 28 days brought 116 views, with just one attributed to Related Shorts and ten to external sources. This does not show a strong Shorts-to-episode route; cover tests did not establish a winner.</li><li>The posting-time test remains inconclusive. The recovered post figures cover different ages, subjects and formats, so they do not isolate the effect of posting hour. The separate historical format test also lacks a valid same-age result; the descriptive lifetime comparison above does not replace it.</li><li>The booking-source field and completed-consultation count remain unverified. Website forms do not close that gap.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-forward">
        <h2 id="oct-forward">What to carry forward</h2>
        <div className={styles.summaryGrid}>
          <article><h3>Keep the existing practices</h3><p>Employer documents on LinkedIn and searchable process titles on YouTube remain useful. October supports continuing them.</p></article>
          <article><h3>Keep the current content mix</h3><p>Keep using filmed answers alongside graphic posts. Filmed Reels drew more views in October’s comparison, but subjects and time online differed. There were only two image or carousel posts, too few to judge those formats. We do not yet have enough evidence to change the balance of formats or the topics we focus on.</p></article>
          <article><h3>Watch the step after viewing</h3><p>Read website forms alongside visibility. The current data cannot identify how many social viewers became qualified inquiries or consultations.</p></article>
        </div>
      </section>
      <footer className={styles.footer}>Numbers from each platform&apos;s own analytics, September 1–30 and October 1–31, 2026, collected November 5, with LinkedIn visitor totals and both YouTube months rechecked November 8. The refreshed September YouTube figures replace the earlier capture for this comparison. October has one more day. Recovered Meta post exports contain lifetime metrics, separate from the monthly totals. The format comparison uses posts published by October 21 and is descriptive, not a controlled test. YouTube follow-up tests use their named first-28-day windows; Episode 4’s cover test ran October 15–29. October-end follower stocks and Meta’s separate calendar-month comments, shares, Instagram saves and Instagram format-view split remain unverified; current November counts are not substituted. The Dot Creative · October 2026 monthly review</footer>
    </article>
  )
}
