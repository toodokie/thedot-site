import type { ReportPlatform, ReportRow } from '@/lib/portal/reports'

// Native calendar-month captures retained in Kanset/content/receipts/2026-11/
// october-performance-review. Preview only: these rows are never persisted.
const comparison = (value: number, prev: number) => ({ value, prev })
const snapshot = (platform: ReportPlatform, metrics: ReportRow['metrics'], summary: string): ReportRow => ({
  id: `preview-2026-10-${platform}`, platform, period: '2026-10',
  period_start: '2026-10-01', period_end: '2026-10-31', schema_version: 1,
  collected_at: '2026-11-05T12:00:00Z', created_at: '2026-11-05T12:00:00Z', updated_at: '2026-11-05T12:00:00Z',
  metrics, summary,
})

export const octoberSnapshots: ReportRow[] = [
  snapshot('instagram', {
    followers: null, viewers: comparison(1353, 1262), views: comparison(4102, 3723),
    interactions: comparison(249, 193), profile_visits: comparison(88, 132), messaging_contacts: comparison(1, 1),
    saves: null, comments: null, shares: null, views_reels: null, views_posts: null, views_stories: null,
  }, 'Viewing and interaction grew. Profile visits fell, against a September total that included the event surge. October-end followers, saves, comments, shares and Instagram format-view detail were unavailable. The unusual final posting week is separated in the monthly review.'),
  snapshot('facebook', {
    followers: null, viewers: comparison(2809, 3272), views: comparison(5203, 6604),
    interactions: comparison(139, 225), messaging_contacts: comparison(1, 3), saves: null, comments: null, shares: null,
  }, 'Viewing and interaction declined. Viewers is the native measure, rather than a newly verified Reach definition. October-end followers and separate saves, comments and shares were unavailable. Missing post detail prevents a new topic or format verdict.'),
  snapshot('youtube', {
    followers: null, unique_viewers: comparison(1433, 754), views: comparison(4466, 2827),
    watch_time_hours: comparison(18.2777, 6.9749), net_subscribers: comparison(4, 5),
    comments: 5, shares: 16,
  }, 'Views rose 58% and watch time more than doubled. Search supplied 1,097 views; Episode 4 supplied 37% of watch time. Net subscribers are compared with net subscribers. October-end subscriber stock was unavailable. Native format and content detail leave small gaps against the account total.'),
  snapshot('linkedin', {
    followers: null, impressions: comparison(686, 496), clicks: comparison(136, 121),
    page_views: comparison(88, 28), custom_button_clicks: 0, interactions: comparison(6, 5), net_followers: 0,
  }, 'Impressions and content clicks increased. Clicks include opening and paging through documents, not only website visits. No net follower growth or custom-button clicks were recorded. October-end followers and the prior unique-visitor total were unavailable.'),
  snapshot('website', {
    sessions: comparison(472, 430), reach: comparison(430, 373), views: comparison(816, 765),
    social_referral_visits: comparison(19, 8), contact_page_views: comparison(97, 105),
    news_article_views: 10, form_submissions: comparison(10, 17), button_clicks: comparison(16, 41),
  }, 'More visits coincided with fewer site-wide form submissions. September unique visitors were rechecked on November 5: 373, replacing the previously captured 409 for this comparison. Social supplied 19 visits: Facebook 17 and Instagram 2. The new article received 10 pageviews. Forms and button clicks are not completed bookings or consultations attributed to social.'),
]
