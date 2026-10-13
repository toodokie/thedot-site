'use client';

import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { onlyPublicSiteEvents } from '@/lib/public-site-analytics';

export default function PublicSiteAnalytics() {
  return (
    <>
      <Analytics beforeSend={onlyPublicSiteEvents} />
      <SpeedInsights beforeSend={onlyPublicSiteEvents} />
    </>
  );
}
