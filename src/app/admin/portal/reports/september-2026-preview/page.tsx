import Link from 'next/link'
import { redirect } from 'next/navigation'
import { verifySession } from '@/lib/auth'
import SeptemberReportBody from '@/app/client/[slug]/reports/september-2026/SeptemberReportBody'
import styles from '@/app/client/[slug]/reports/july-2026/report.module.css'
import sept from '@/app/client/[slug]/reports/september-2026/september.module.css'

export const dynamic = 'force-dynamic'

// Agency-only draft preview of the September 2026 report. Admin session required; nothing here is
// client-visible. The Strategy cards below are the DRAFT wording; they reach Maria only when written
// with portal-write at release.
const draftStrategyCards: { key: string; area: string; title: string; body: string; note?: string }[] = [
  { key: 'perf-2026-07-h1:twice-monthly-checkins (reword)', area: 'Growth · all', title: 'Judge progress by qualified action, not views alone',
    body: 'In September Facebook reached 3,272 people and Instagram 1,262, and Instagram, Facebook and YouTube together drew more than 13,000 views, while kanset.com received 17 form submissions and only 8 visits from social media. Each monthly report pairs platform numbers with website actions, calls and completed consultations, so growth is judged by who takes the next step.' },
  { key: 'perf-2026-07-h1:reels-for-reach (reword)', area: 'Content · all', title: 'Use video for reach and carousels for reference',
    body: 'Across July, August and September, video reached more people than carousels on Instagram and Facebook. Keep carousels to one reference post a week, for content worth saving, and put the week\'s priority subject into a Reel.',
    note: 'Candidate to fold into the new "filmed answer first" card if nine cards is too many.' },
  { key: 'perf-2026-07-h1:maria-on-camera (reword)', area: 'Content · all', title: 'Put the useful answer in the first six seconds',
    body: 'Viewers decide in the first seconds. Open with the useful answer, keep most talking-head cuts to about 15 to 40 seconds, and open each weekly news reel on the practical fact before the roundup label and date.' },
  { key: 'perf-2026-07-h1:yt-shorts-episodes (reword)', area: 'Platform · YouTube', title: 'Use YouTube Shorts for discovery and the podcast for depth',
    body: 'In September, Shorts brought 2,682 of the channel\'s 2,827 views and five of its six new subscribers. Every Kanset Talks cut links to its full episode, and episode titles and thumbnails are tested before any change is kept.' },
  { key: 'perf-2026-07-h1:hook-interaction (reword)', area: 'Growth · website', title: 'Track the step after a website enquiry',
    body: 'Kanset.com received 17 form submissions and 41 button clicks in September. The missing number is completed consultations. Add a required "How did you hear about us?" field in Microsoft Bookings, and give reception the same source list for phone bookings.',
    note: 'Keep unless the booking-form field is already live. Anastasia to confirm.' },
  { key: 'perf-2026-09:reel-format (new)', area: 'Content · all', title: 'Lead with a filmed answer when one exists',
    body: 'In August and September, filmed answers outperformed animated reels on Instagram and Facebook; in September a typical filmed answer drew about three times the views. When an approved Ask Kanset or Kanset Talks clip answers the week\'s question, it takes the Reel slot. Animated reels carry news that needs a number, date or comparison on screen.' },
  { key: 'perf-2026-09:youtube-search (new)', area: 'Platform · YouTube', title: 'Name the process in every YouTube title',
    body: 'YouTube search brought 765 views in September, a quarter of the channel. Titles that start with the process people type, such as OINP or work permit extension, were found; statement and date titles were not.' },
  { key: 'perf-2026-09:linkedin-documents (new)', area: 'Platform · LinkedIn', title: 'Lead employer guides on LinkedIn with a document',
    body: 'In August and September, employer guides posted as documents drew far more engagement than video posts. On LinkedIn, employer guides go out as documents; on Instagram and Facebook, employer topics stay in the Reel slot, framed as one clear question.' },
  { key: 'perf-2026-10:filmed-employer (new)', area: 'Content · all', title: 'Film employer answers at the next shoot',
    body: 'In August, Maria\'s filmed answers on promoting a foreign worker, layoffs and unpaid leave were among the strongest posts on Instagram and Facebook. In September every employer post was animated and reached far fewer people. Three or four new filmed employer answers would let employer topics compete on equal terms again.',
    note: 'Only if Maria agrees to proposal 5; otherwise drop.' },
]

export default async function SeptemberReportPreview() {
  const session = await verifySession()
  if (!session || session.role !== 'admin') redirect('/admin/login')

  return (
    <>
      <div style={{ background: '#fff4c2', border: '1px solid #e0c96a', padding: '12px 16px', margin: '16px', borderRadius: 8 }}>
        <strong>Agency copy of the September report.</strong> Maria sees the same body at her Reports page.{' '}
        <Link href="/admin/portal/reports">Back to Reports</Link>
      </div>
      <SeptemberReportBody backHref="/admin/portal/reports" backLabel="← Agency reports" strategyHref="/admin/portal/strategy"
        feedback={<p style={{ margin: '40px 0', padding: 16, border: '1px dashed #b9a24b', borderRadius: 12 }}>Maria sees a &ldquo;Questions or comments?&rdquo; box here. Her note lands on the ideas board as &ldquo;Feedback on the September 2026 report&rdquo;.</p>} />
      <main className={`${styles.page} ${sept.wide} ${sept.lists}`}>
        <section className={styles.section} aria-labelledby="draft-strategy">
          <h2 id="draft-strategy">Draft Strategy cards (written at release)</h2>
          <p className={styles.context}>Five July cards reworded in place (same keys, so no duplicates) and four new ones. Nothing below is on Maria&apos;s Strategy page yet.</p>
          <div className={`${styles.findings} ${sept.pair}`}>
            {draftStrategyCards.map((card) => (
              <article key={card.key} className={styles.finding}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <p className={styles.actionMeta}>{card.area} · {card.key}{card.note ? ` · ${card.note}` : ''}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  )
}
