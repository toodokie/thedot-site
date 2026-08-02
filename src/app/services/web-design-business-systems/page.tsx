import type { Metadata } from 'next';
import ServicePageLayout, { ServicePageData } from '@/components/ServicePageLayout';
import Footer from '@/components/Footer';
import { serviceSchema, faqPageSchema } from '@/lib/service-schema';

const slug = 'web-design-business-systems';

const data: ServicePageData = {
  eyebrow: 'Web + Systems',
  h1: 'Websites and connected business systems.',
  lede: 'A great website is where customers meet you &mdash; but a beautiful site that&rsquo;s disconnected from the tools you actually run still leaves you doing the busywork by hand. We design accessible, conversion-focused websites for Ontario businesses, then connect them to the systems behind them.',
  ctas: [
    { label: 'Get a scoped quote', href: '/brief', kind: 'button' },
    { label: 'Build an estimate &rarr;', href: '/estimate', kind: 'link' },
  ],
  why: {
    heading: 'One system, not five that don&rsquo;t talk',
    body: 'Most small businesses run a website, a CRM, an accounting tool, a scheduler and an intake form &mdash; none of which talk to each other. So the same information gets re-typed, leads slip, and hours disappear into admin. We design the website as the front end of one connected system, so the work flows instead of piling up.',
  },
  covers: {
    heading: 'What we build',
    cards: [
      { title: 'Strategic website design', body: 'Custom, mobile-first, conversion-focused design &mdash; built around your customers and how they actually decide.' },
      { title: 'Business systems integration', body: 'We connect your site to the CRM, accounting, scheduling and intake tools you already run, so data flows in one place.' },
      { title: 'Workflow automation', body: 'The manual, repetitive steps in your client and admin work get automated &mdash; <a href="/services/workflow-automation">more on automation</a>.' },
      { title: 'Accessibility built in', body: 'AODA/WCAG accessibility from the start, not bolted on &mdash; <a href="/services/aoda-web-accessibility">more on AODA</a>.' },
      { title: 'Found, not just built', body: 'Structured for search and for AI answers, with the technical SEO foundations in place from day one.' },
      { title: 'Support that sticks around', body: 'Training, documentation and a support window so your team can actually run the thing.' },
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      { title: 'Discovery', body: 'We learn your business, your customers and the tools you run today.' },
      { title: 'Design & build', body: 'We design and build the site &mdash; accessible, on-brand and built to convert.' },
      { title: 'Integrate & automate', body: 'We connect your systems and automate the workflows in between.' },
      { title: 'Launch & optimise', body: 'We launch, train your team, and tune it against how you really work.' },
    ],
  },
  faqs: {
    heading: 'Frequently asked questions',
    items: [
      { q: 'What does a “connected business system” actually mean?', a: 'It means your website isn&rsquo;t a standalone brochure &mdash; it&rsquo;s wired into your CRM, accounting, scheduling and intake tools, with the repetitive steps between them automated. One system instead of five disconnected apps.' },
      { q: 'How much does a website cost?', a: 'Our Professional Foundation websites run $2,500&ndash;$4,500, and a fully Connected Business System (site + integration + automation) runs $5,500&ndash;$7,500. Every project is scoped, so <a href="/brief">start a brief</a> for a real quote.' },
      { q: 'Do you work with the tools I already use?', a: 'Yes &mdash; the goal is to connect what you already run (QuickBooks, your CRM, booking and intake tools), not to make you switch everything.' },
      { q: 'Is accessibility included?', a: 'Accessibility (AODA/WCAG) is built into every site we design. We also audit existing sites &mdash; see our <a href="/services/aoda-web-accessibility">AODA service</a>.' },
    ],
  },
  final: {
    heading: 'Let&rsquo;s build something that works as hard as you do.',
    body: 'Tell us about your project and we&rsquo;ll put together a scoped quote.',
  },
};

export const metadata: Metadata = {
  title: 'Web Design + Business Systems Integration, Ontario | The Dot Creative',
  description:
    'Accessible, conversion-focused websites connected to your CRM, accounting, scheduling and intake tools — one connected business system for growing Ontario businesses.',
  keywords: 'web design Ontario, business systems integration, CRM integration, QuickBooks website integration, connected business system, Ontario web design agency',
  alternates: { canonical: `https://www.thedotcreative.co/services/${slug}` },
  openGraph: {
    title: 'Websites and Connected Business Systems',
    description: 'Accessible, conversion-focused websites connected to the tools you already run.',
    url: `https://www.thedotcreative.co/services/${slug}`,
    siteName: 'The Dot Creative Agency',
    images: [{ url: '/images/The Dot Poster.webp', width: 1200, height: 630, alt: 'The Dot Creative Agency — Web Design + Business Systems' }],
    locale: 'en_CA',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function Route() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema({ slug, name: 'Web Design & Business Systems Integration', serviceType: 'Web design and business systems integration', description: 'Accessible, conversion-focused websites connected to your CRM, accounting, scheduling and intake tools — one connected business system for Ontario businesses.' })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(data.faqs.items)) }} />
      <ServicePageLayout {...data} />
      <Footer />
    </>
  );
}
