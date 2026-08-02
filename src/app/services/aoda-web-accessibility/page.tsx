import type { Metadata } from 'next';
import ServicePageLayout, { ServicePageData } from '@/components/ServicePageLayout';
import Footer from '@/components/Footer';
import { serviceSchema, faqPageSchema } from '@/lib/service-schema';

const slug = 'aoda-web-accessibility';
const schemaDescription =
  'AODA / WCAG web accessibility for Ontario organizations: accessible design and development built in from the start, plus practical audits and prioritized fix lists for existing sites.';

const data: ServicePageData = {
  eyebrow: 'AODA Accessibility',
  h1: 'Accessible websites that meet Ontario&rsquo;s AODA requirements.',
  lede: 'Under the AODA, many Ontario organizations&rsquo; websites are expected to meet WCAG accessibility standards. We build accessibility in from the first design decision. For sites you already have, we run a practical audit with a prioritized list of what to fix and how.',
  ctas: [
    { label: 'Get a scoped quote', href: '/brief', kind: 'button' },
    { label: 'Talk to us &rarr;', href: '/contacts', kind: 'link' },
  ],
  why: {
    heading: 'Accessible is better for everyone (and it&rsquo;s the law)',
    body: 'An accessible site works for people using screen readers, keyboards, magnification, or just a small phone in bright sun. Which is to say, more of your customers. For many Ontario organizations it&rsquo;s also an AODA obligation, and building it in is far cheaper than retrofitting after a complaint.',
  },
  covers: {
    heading: 'What we do',
    cards: [
      { title: 'AODA / WCAG audit', body: 'A practical review of your site against WCAG 2.0/2.1 AA (the standard AODA points to), tested on real assistive technology.' },
      { title: 'Prioritized fix list', body: 'Plain-English findings ranked by impact and effort, so you fix what matters first, not a wall of tickets.' },
      { title: 'Accessible design & build', body: 'Colour contrast, focus states, semantic structure, labels and keyboard support designed in from the start.' },
      { title: 'Assistive-tech testing', body: 'We test with keyboards and screen readers, not just an automated scanner that misses most real issues.' },
      { title: 'Documentation', body: 'A clear record of what was done and the standard met, useful if anyone ever asks.' },
      { title: 'Ongoing compliance', body: 'Accessibility drifts as content changes; we can keep it maintained. See <a href="/services/managed-website-growth">managed growth</a>.' },
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      { title: 'Audit', body: 'We review your site against WCAG on real assistive technology.' },
      { title: 'Prioritise', body: 'You get a ranked fix list: highest impact, lowest effort first.' },
      { title: 'Fix', body: 'We implement the fixes (or build the new site accessible from the start).' },
      { title: 'Verify', body: 'We re-test and document the standard met.' },
    ],
  },
  note: {
    title: 'A note on legal obligations',
    body: 'Whether the AODA applies to your organization, and to what standard, depends on your size, sector and how your site is used. This page is guidance, not legal advice; confirm your specific obligations against current Ontario requirements and, where needed, qualified legal counsel. What we do is make your site genuinely accessible and document the standard met.',
  },
  faqs: {
    heading: 'Frequently asked questions',
    items: [
      { q: 'Does the AODA apply to my website?', a: 'It depends on your organization&rsquo;s size and sector. Many Ontario businesses and non-profits with public-facing websites are covered. We can assess your site, but confirm your legal obligations with current Ontario guidance or counsel. This isn&rsquo;t legal advice.' },
      { q: 'What standard do you follow?', a: 'WCAG 2.0/2.1 Level AA, the standard the AODA points to for web content.' },
      { q: 'Can you fix my existing site, or only new builds?', a: 'Both. We audit and remediate existing sites, and we build new sites accessible from the start.' },
      { q: 'Isn&rsquo;t an automated accessibility checker enough?', a: 'No. Automated scanners catch only a fraction of real issues. Genuine accessibility needs testing with keyboards and screen readers, which is what we do.' },
    ],
  },
  final: {
    heading: 'Make your site work for everyone.',
    body: 'Start with an audit, or build it in from the ground up. Either way, let&rsquo;s scope it.',
  },
};

export const metadata: Metadata = {
  title: 'AODA Compliant Website Design & Accessibility Audits, Ontario | The Dot Creative',
  description: schemaDescription,
  keywords: 'AODA compliant website design Ontario, AODA website audit, WCAG accessibility Ontario, website accessibility audit Toronto, accessible web design Ontario',
  alternates: { canonical: `https://www.thedotcreative.co/services/${slug}` },
  openGraph: {
    title: 'AODA Accessibility: Compliant, Usable Websites',
    description: schemaDescription,
    url: `https://www.thedotcreative.co/services/${slug}`,
    siteName: 'The Dot Creative Agency',
    images: [{ url: '/images/The Dot Poster.webp', width: 1200, height: 630, alt: 'The Dot Creative Agency: AODA Accessibility' }],
    locale: 'en_CA',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function Route() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema({ slug, name: 'AODA Web Accessibility', serviceType: 'AODA / WCAG web accessibility', description: schemaDescription })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(data.faqs.items)) }} />
      <ServicePageLayout {...data} />
      <Footer />
    </>
  );
}
