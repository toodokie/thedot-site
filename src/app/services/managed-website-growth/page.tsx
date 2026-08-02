import type { Metadata } from 'next';
import ServicePageLayout, { ServicePageData } from '@/components/ServicePageLayout';
import Footer from '@/components/Footer';
import { serviceSchema, faqPageSchema } from '@/lib/service-schema';

const slug = 'managed-website-growth';
const schemaDescription =
  'Ongoing website optimization for Ontario businesses: performance and Core Web Vitals, conversion, SEO and AI-visibility upkeep, and accessibility maintenance, so your site keeps improving after launch.';

const data: ServicePageData = {
  eyebrow: 'Managed Growth',
  h1: 'Your website, continuously improved.',
  lede: 'A website isn&rsquo;t &ldquo;done&rdquo; at launch. It drifts. Pages slow down, content goes stale, competitors move, and the way customers find you keeps changing. Managed growth keeps your site fast, accessible, findable and converting, month after month, instead of a one-time build that quietly ages.',
  ctas: [
    { label: 'Talk to us', href: '/contacts', kind: 'button' },
    { label: 'Run the free AI check &rarr;', href: '/tools/ai-visibility', kind: 'link' },
  ],
  why: {
    heading: 'The site you launched isn&rsquo;t the site you have a year later',
    body: 'Search changes, AI answers change, your offer changes, and content accumulates. Without upkeep, speed slips, accessibility regresses, and you gradually fall out of the results, human and AI alike. Managed growth is the difference between a site that compounds and one that decays.',
  },
  covers: {
    heading: 'What&rsquo;s included',
    cards: [
      { title: 'Performance & Core Web Vitals', body: 'We keep the site fast (speed, LCP and stability), because slow pages quietly cost you customers and rankings.' },
      { title: 'Conversion optimisation', body: 'Ongoing improvements to the pages and flows that turn visitors into enquiries.' },
      { title: 'SEO & content upkeep', body: 'Keeping your pages structured, current and competitive as search shifts.' },
      { title: 'AI-visibility upkeep', body: 'Keeping you findable in AI answers as the assistants change. See <a href="/services/ai-visibility-audit">AI Visibility</a>.' },
      { title: 'Accessibility maintenance', body: 'Accessibility drifts as content changes; we keep it holding to standard.' },
      { title: 'Reporting you&rsquo;ll actually read', body: 'A short monthly view of what changed and what it moved, not a data dump.' },
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      { title: 'Baseline', body: 'We measure where the site stands today: speed, accessibility, conversion, visibility.' },
      { title: 'Prioritise', body: 'Each month we pick the highest-impact improvements.' },
      { title: 'Improve', body: 'We implement them on your live site.' },
      { title: 'Report', body: 'You get a short monthly summary of what changed and why.' },
    ],
  },
  faqs: {
    heading: 'Frequently asked questions',
    items: [
      { q: 'What&rsquo;s actually included?', a: 'Performance and Core Web Vitals, conversion improvements, SEO and content upkeep, AI-visibility maintenance, accessibility upkeep, and a short monthly report. We scope the exact mix to your site.' },
      { q: 'Is this a monthly retainer?', a: 'Yes. It&rsquo;s an ongoing arrangement, because the point is continuous improvement rather than a one-off project.' },
      { q: 'Do I need to have built the site with you?', a: 'No. We can take over maintenance and optimisation of an existing site after a short onboarding audit.' },
      { q: 'What results can I expect?', a: 'That depends on where you&rsquo;re starting. The honest answer is steady, compounding gains in speed, accessibility, findability and conversion, measured monthly, not a magic overnight jump.' },
    ],
  },
  final: {
    heading: 'Keep your site compounding.',
    body: 'Let&rsquo;s talk about what ongoing optimisation would move for you.',
  },
};

export const metadata: Metadata = {
  title: 'Managed Website Optimization & Growth, Ontario | The Dot Creative',
  description: schemaDescription,
  keywords: 'managed website optimization Ontario, website maintenance Ontario, ongoing SEO, Core Web Vitals, conversion optimization, website care plan Ontario',
  alternates: { canonical: `https://www.thedotcreative.co/services/${slug}` },
  openGraph: {
    title: 'Managed Website Growth: Continuously Improved',
    description: schemaDescription,
    url: `https://www.thedotcreative.co/services/${slug}`,
    siteName: 'The Dot Creative Agency',
    images: [{ url: '/images/The Dot Poster.webp', width: 1200, height: 630, alt: 'The Dot Creative Agency: Managed Website Growth' }],
    locale: 'en_CA',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function Route() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema({ slug, name: 'Managed Website Growth', serviceType: 'Managed website optimization', description: schemaDescription })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(data.faqs.items)) }} />
      <ServicePageLayout {...data} />
      <Footer />
    </>
  );
}
