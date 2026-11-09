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
  { name: 'Instagram', rows: [['Viewers', '1,262', '1,353'], ['Interactions', '193', '249'], ['Profile visits', '132', '88']], note: 'Views and interactions increased, but fewer people visited the profile. September included a jump in profile visits after your event, which makes it a higher starting point for this comparison.' },
  { name: 'Facebook', rows: [['Viewers', '3,272', '2,809'], ['Interactions', '225', '139'], ['Messaging contacts', '3', '1']], note: 'Views and interactions both fell. Reels accounted for 4,916 of the 5,203 views. The filmed-versus-animated comparison appears below.' },
  { name: 'YouTube', rows: [['Unique viewers', '768', '1,433'], ['Hours watched', '7.0', '18.3'], ['Net new subscribers', '5', '4']], note: 'More people watched, and total watch time grew. The channel added four subscribers after losses, compared with five in September. YouTube search brought 1,097 views, up from 761.' },
  { name: 'LinkedIn', rows: [['Content clicks', '121', '136'], ['Page views', '28', '88'], ['Unique visitors', '13', '21']], note: 'More people visited the page and clicked the content. These clicks include opening documents and turning their pages. The follower total did not grow, and the page’s custom button recorded zero clicks.' },
  { name: 'Website', rows: [['Visits', '430', '472'], ['Form submissions', '17', '10'], ['Site button clicks', '41', '16']], note: 'Website visits increased, but form submissions fell. These counts cover the whole website. They do not tell us how many consultations were booked or came from social media.' },
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
          <article><h3>More visits, fewer form submissions</h3><ul><li>Website visits 430 → <strong>472</strong></li><li>Form submissions 17 → <strong>10</strong></li><li>Visits from social media 8 → 19</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-channels">
        <h2 id="oct-channels">Your channels · September → October</h2>
        <p className={styles.pathIntro}>Each pair below reads September → October: September 1–30 and October 1–31, 2026. The totals include activity on older posts and videos. October has one extra day.</p>
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
        <p className={styles.pathIntro}>Posting was less regular in the final week of October. That week is included in the monthly totals. Its different posting rhythm may have affected performance, so it is a poor basis for deciding which topics or formats to keep.</p>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}>
            <h3>Social views fell sharply from the previous week</h3>
            <table className={oct.weekTable}><caption>Total account views in two Monday-to-Friday periods</caption><thead><tr><th scope="col">Platform</th><th scope="col">Oct 19–23</th><th scope="col">Oct 26–30</th></tr></thead><tbody>
              <tr><th scope="row">Instagram</th><td>1,325</td><td>633 <small>(-52%)</small></td></tr>
              <tr><th scope="row">Facebook</th><td>1,447</td><td>705 <small>(-51%)</small></td></tr>
              <tr><th scope="row">YouTube</th><td>850</td><td>251 <small>(-70%)</small></td></tr>
            </tbody></table>
            <p>The previous week, October 19–23, was the strongest full Monday-to-Friday week on Instagram and Facebook. Instagram’s final week still beat October 5–9, which had 591 views. These totals include older posts. They cannot tell us how much of the drop came from less regular posting, the subjects, the formats or how widely platforms showed the content.</p>
          </article>
          <article className={styles.finding}><h3>Website visits rose in the final week</h3><ul><li>October 25–31: <strong>124 visits</strong>, including 11 from social sources</li><li>October 18–24: 109 visits, none attributed to social</li><li>The final week had October&apos;s highest website visits</li></ul><p>The website uses Sunday-to-Saturday weeks, unlike the social comparison beside it. Website visits rose while social views fell; the final week was not weaker everywhere.</p></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-formats">
        <h2 id="oct-formats">Filmed Reels drew more views than animated graphics</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>The middle result, rather than the biggest hit</h3><ul><li>Instagram views per Reel (median): <strong>190 filmed · 69 animated</strong></li><li>Facebook views per Reel (median): <strong>376 filmed · 63.5 animated</strong></li><li>Seven filmed and eight animated Reels on each platform, all published by October 21. The median is the middle result, so one very popular post does not set the comparison.</li></ul></article>
          <article className={styles.finding}><h3>Keep filmed answers, without declaring a winning format</h3><p>These views were counted from each post’s publication through November 5, not just during October. Every post had been online for at least 15 calendar days, but their ages and subjects differed. The results support continuing filmed answers; they do not prove that filming caused the difference. There were only two image or carousel posts, too few to decide whether to use those formats more or less often.</p></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-findings">
        <h2 id="oct-findings">What stood out</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>Two Shorts brought 44% of YouTube views</h3><ul><li>The Niagara Falls clip received <strong>1,234 views</strong> during October. &ldquo;Moving to Canada: my top 3 reasons&rdquo; received <strong>733</strong>. Together, that is <strong>1,967 views</strong>, or 44% of the channel’s total. Two clips are not enough to establish which subjects work best.</li><li>People spent <strong>6.8 hours watching Episode 4</strong> during October, 37% of all watch time on the channel.</li><li>YouTube search brought 1,097 views, up from 761. More views still came from the Shorts feed: 2,979.</li></ul></article>
          <article className={styles.finding}><h3>People opened employer documents and older articles</h3><ul><li>By November 5, the two October employer documents on LinkedIn had received 24 and 36 content clicks since publication. The episode-launch video had received 8. These posts had different amounts of time online, so this does not prove that documents outperform video.</li><li>During October, the new episode article received 10 pageviews. The September article received 14 and the August article received 11.</li><li>Website contact-page views fell from 105 to 97.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-follow-through">
        <h2 id="oct-follow-through">Following up on September</h2>
        <div className={`${styles.findings} ${sept.pair}`}>
          <article className={styles.finding}><h3>A quicker episode opening</h3><ul><li>Episode 4 reaches its topic at 0:11 and its first question at 0:26, so it kept its recorded opening.</li><li>An added opening teaser was approved on October 6, but October did not test its effect. Under the November 8 decision, Episode 5 keeps its recorded opening; future added openings need an explicit decision for that episode.</li></ul></article>
          <article className={styles.finding}><h3>The cover test did not find a winner</h3><p>YouTube tested three Episode 4 covers from October 15 to 29. The covers were not shown enough times for YouTube to identify a winner. The original cover stays; this test does not support choosing a new style.</p></article>
          <article className={styles.finding}><h3>Two longer YouTube clips published; one result ready</h3><ul><li>The clips went live October 7 and 13. They run 4:33 and 6:20, so the first is shorter than the suggested 5–10 minutes.</li><li>In its first 28 calendar days, the first clip received 47 views, including 14 from search, and added one subscriber after losses. YouTube reported an average view of 56 seconds on the 4:33 video.</li><li>The second clip reaches its 28-day review on November 10. The first attracted few views. We should read both results before deciding whether to make more clips like these.</li></ul></article>
          <article className={styles.finding}><h3>Personal sharing at launch</h3><p>We suggested sharing the episode through personal accounts at launch. We have not verified whether that happened or how many views it brought.</p></article>
          <article className={styles.finding}><h3>New filmed employer answers</h3><p>A new answer about Ontario Immigrant Nominee Program (OINP) employer requirements for multiple workers went live October 27. The new filming contains two versions of that same answer. That is one distinct employer question, so it does not complete the suggested three or four different answers.</p></article>
          <article className={styles.finding}><h3>Episode follow-up clips were late</h3><p>Two Episode 4 follow-up clips went live October 20 and 23. The third appeared in November. We therefore missed the target of three or four clips within days 2–10 after launch. Episode 3’s October clips were also late after its September 17 launch.</p></article>
          <article className={styles.finding}><h3>What the tests still cannot tell us</h3><ul><li>Episode 3 received 116 views in its first 28 days. YouTube attributed just one to Related Shorts and ten to sources outside YouTube. This does not show that Shorts are sending many viewers to the full episode. The cover tests also produced no winner.</li><li>We cannot yet tell whether the tested posting times worked better. Post subjects, formats and time online also differed. The earlier filmed-versus-animated test still has no result measured after the same number of days online; the comparison above cannot replace it.</li><li>We have not verified whether bookings record how people found Kanset, or how many consultations took place. Website form totals cannot supply either answer.</li></ul></article>
        </div>
      </section>
      <section className={styles.section} aria-labelledby="oct-forward">
        <h2 id="oct-forward">What we should keep doing</h2>
        <div className={styles.summaryGrid}>
          <article><h3>Keep employer guides and clear YouTube titles</h3><p>Keep employer guides as LinkedIn documents. Keep naming the immigration process in YouTube titles when that is what the video explains. October’s results support continuing these practices.</p></article>
          <article><h3>Keep the current content mix</h3><p>Keep using filmed answers alongside graphic posts. Filmed Reels drew more views in October’s comparison, but subjects and time online differed. There were only two image or carousel posts, too few to judge those formats. We do not yet have enough evidence to change the balance of formats or the topics we focus on.</p></article>
          <article><h3>Track enquiries and consultations as well as views</h3><p>Views alone do not tell us whether the content brings potential clients. Read them alongside website forms. We still cannot tell how many social viewers became suitable enquiries or completed consultations.</p></article>
        </div>
      </section>
      <footer className={styles.footer}>
        <p><strong>Dates and sources.</strong> Each platform’s own analytics covers September 1–30 and October 1–31, 2026. Most figures were collected November 5. LinkedIn visitor totals and both YouTube months were rechecked November 8. This comparison uses the refreshed September YouTube figures. October has one extra day.</p>
        <p><strong>Post comparisons and tests.</strong> The Meta post exports count views since publication, not just during October. The filmed-versus-animated comparison uses posts published by October 21; their ages and subjects differ. Each YouTube follow-up uses its stated first-28-day window. Episode 4’s cover test ran October 15–29.</p>
        <p><strong>Figures still to verify.</strong> October-end follower and subscriber totals, monthly Instagram and Facebook comments and shares, Instagram saves, and Instagram views split by format. Current November follower counts are not used in place of October-end totals.</p>
        <p>The Dot Creative · October 2026 monthly review</p>
      </footer>
    </article>
  )
}
