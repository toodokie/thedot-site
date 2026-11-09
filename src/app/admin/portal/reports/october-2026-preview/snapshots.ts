import type { ReportPlatform, ReportRow } from '@/lib/portal/reports'

// Native calendar-month captures retained in Kanset/content/receipts/2026-11/
// october-performance-review. Preview only: these rows are never persisted.
const value = (value: number | null) => ({ value })
const comparison = (value: number, prev: number) => ({ value, prev })
const snapshot = (platform: ReportPlatform, metrics: ReportRow['metrics'], summary: string): ReportRow => ({
  id: `preview-2026-10-${platform}`, platform, period: '2026-10',
  period_start: '2026-10-01', period_end: '2026-10-31', schema_version: 1,
  collected_at: '2026-11-05T12:00:00Z', created_at: '2026-11-05T12:00:00Z', updated_at: '2026-11-05T12:00:00Z',
  metrics, summary,
  ...(platform === 'youtube' || platform === 'linkedin' ? { collected_at: '2026-11-08', updated_at: '2026-11-08' } : {}),
})

export const octoberSnapshots: ReportRow[] = [
  snapshot('instagram', {
    followers: value(null), reach: value(null), viewers: comparison(1353, 1262), views: comparison(4102, 3723),
    interactions: comparison(249, 193), profile_visits: comparison(88, 132), messaging_contacts: comparison(1, 1),
    saves: value(null), comments: value(null), shares: value(null), views_reels: value(null), views_posts: value(null), views_stories: value(null),
  }, 'Views rose 10% and interactions rose 29%. Profile visits fell from 132 to 88; September included the event surge. The monthly report examines the unusual final posting week separately.'),
  snapshot('facebook', {
    followers: value(null), reach: value(null), viewers: comparison(2809, 3272), views: comparison(5203, 6604),
    interactions: comparison(139, 225), messaging_contacts: comparison(1, 3), saves: value(null), comments: value(null), shares: value(null),
  }, 'Views fell 21% and interactions fell 38%. Filmed answers had higher median lifetime views than graphic Reels in the recovered post comparison. Different post ages and subjects limit that comparison; the monthly report gives the details and separates the unusual final week.'),
  snapshot('youtube', {
    followers: value(null), reach: comparison(1433, 768), views: comparison(4466, 2804),
    watch_time_hours: comparison(18.278, 6.9659), net_subscribers: comparison(4, 5),
    comments: value(5), shares: value(16), interactions: value(79),
    views_shorts: value(4239), views_videos: value(221),
    avg_view_duration_seconds: value(18.278 * 3600 / 4466),
  }, 'Compared with September 1–30, October 1–31 brought 59% more views and more than twice the watch time. Search supplied 1,097 views; Episode 4 supplied 37% of watch time. Net subscriber growth fell from five to four.'),
  snapshot('linkedin', {
    followers: value(null), impressions: comparison(686, 496), clicks: comparison(136, 121),
    page_views: comparison(88, 28), reach: comparison(21, 13), custom_button_clicks: value(0), interactions: comparison(6, 5), net_followers: value(0),
    views: value(null), comments: value(3), shares: value(0),
  }, 'Impressions rose 38%, and unique page visitors increased from 13 to 21. Content clicks rose from 121 to 136, including document opens and page turns. Net follower change was zero, and the page’s custom button received no clicks.'),
  snapshot('website', {
    followers: value(null), interactions: value(null), comments: value(null), shares: value(null),
    sessions: comparison(472, 430), reach: comparison(430, 373), views: comparison(816, 765),
    social_referral_visits: comparison(19, 8), contact_page_views: comparison(97, 105),
    news_article_views: value(10), form_submissions: comparison(10, 17), button_clicks: comparison(16, 41),
  }, 'More visits coincided with fewer site-wide form submissions. Social supplied 19 visits: Facebook 17 and Instagram 2. The new article received 10 pageviews. Forms and button clicks are not completed bookings or consultations attributed to social.'),
]

// Kept apart from the performance summaries so missing capture is explicit
// without obscuring what the verified results mean.
export const octoberComparisonLabel = 'September 1–30 → October 1–31, 2026. Previous values refer to September. October has one extra day.'
export const octoberMeasurementNotes = [
  'Month-end follower and subscriber totals are still unverified. Current November counts are not substituted. These totals differ from the verified monthly net changes.',
  'Instagram and Facebook calendar-month comments and shares, Instagram saves and the Instagram format-view split still need verification. Recovered post exports contain lifetime metrics and cannot fill those monthly fields. Facebook Viewers is kept under its native label.',
  'YouTube’s 14.7-second watch-time-per-view figure divides total watch time by all views. It differs from Studio’s native 38-second average view duration, which uses a different view basis. Shorts and video detail leaves six views outside those two rows; the channel total is retained.',
  'LinkedIn video views were not verified. Its shares figure means reposts; content clicks include document opens and page turns. Website audience and engagement fields that do not apply are omitted from the displayed tiles.',
  'Most figures were collected November 5. Both YouTube months and LinkedIn unique visitors were rechecked November 8. Refreshed September YouTube totals are used here. Website September unique visitors were rechecked at 373, replacing the earlier capture of 409 for this comparison. The previously published September report remains unchanged.',
]

export const octoberMetricLabels = { youtube: { avg_view_duration_seconds: 'Watch time per view (seconds)' } }
