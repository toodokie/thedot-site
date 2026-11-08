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
  }, 'Views rose 10% and interactions rose 29%. Profile visits fell from 132 to 88; September included the event surge. The monthly report examines the unusual final posting week separately.'),
  snapshot('facebook', {
    followers: null, viewers: comparison(2809, 3272), views: comparison(5203, 6604),
    interactions: comparison(139, 225), messaging_contacts: comparison(1, 3), saves: null, comments: null, shares: null,
  }, 'Views fell 21% and interactions fell 38%. Filmed answers had higher median lifetime views than graphic Reels in the recovered post comparison. Different post ages and subjects limit that comparison; the monthly report gives the details and separates the unusual final week.'),
  snapshot('youtube', {
    followers: null, unique_viewers: comparison(1433, 754), views: comparison(4466, 2827),
    watch_time_hours: comparison(18.2777, 6.9749), net_subscribers: comparison(4, 5),
    comments: 5, shares: 16,
  }, 'Compared with September 1–30, October 1–31 brought 58% more views and more than twice the watch time. Search supplied 1,097 views; Episode 4 supplied 37% of watch time. Net subscriber growth fell from five to four.'),
  snapshot('linkedin', {
    followers: null, impressions: comparison(686, 496), clicks: comparison(136, 121),
    page_views: comparison(88, 28), unique_visitors: comparison(21, 13), custom_button_clicks: 0, interactions: comparison(6, 5), net_followers: 0,
  }, 'Impressions rose 38%, and unique page visitors increased from 13 to 21. Content clicks rose from 121 to 136, including document opens and page turns. Net follower change was zero, and the page’s custom button received no clicks.'),
  snapshot('website', {
    sessions: comparison(472, 430), reach: comparison(430, 373), views: comparison(816, 765),
    social_referral_visits: comparison(19, 8), contact_page_views: comparison(97, 105),
    news_article_views: 10, form_submissions: comparison(10, 17), button_clicks: comparison(16, 41),
  }, 'More visits coincided with fewer site-wide form submissions. September unique visitors were rechecked on November 5: 373, replacing the previously captured 409 for this comparison. Social supplied 19 visits: Facebook 17 and Instagram 2. The new article received 10 pageviews. Forms and button clicks are not completed bookings or consultations attributed to social.'),
]
