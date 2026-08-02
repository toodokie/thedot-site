import type { Metadata } from 'next';
import ServicePageLayout, { ServicePageData } from '@/components/ServicePageLayout';
import Footer from '@/components/Footer';
import { serviceSchema, faqPageSchema } from '@/lib/service-schema';

const slug = 'workflow-automation';
const schemaDescription =
  'We map the manual, repetitive steps in your client and admin workflows and automate them end to end — connecting your CRM, accounting, scheduling and intake tools so routine work runs itself.';

const data: ServicePageData = {
  eyebrow: 'Workflow Automation',
  h1: 'Automate the busywork that eats your week.',
  lede: 'Manual client intake, re-typing the same details into three apps, chasing approvals, copy-pasting invoices &mdash; the quiet admin that costs you hours every week. We map those workflows and automate them end to end, so routine work runs itself. Connected systems typically save clients <strong>10&ndash;20 hours a month</strong>.',
  ctas: [
    { label: 'Get a scoped quote', href: '/brief', kind: 'button' },
    { label: 'Run the free AI check &rarr;', href: '/tools/ai-visibility', kind: 'link' },
  ],
  why: {
    heading: 'The hidden cost of &ldquo;we&rsquo;ll just do it manually&rdquo;',
    body: 'Manual work feels free &mdash; until you count the hours, the mistakes from re-keying data, and the leads that slip because a follow-up didn&rsquo;t happen. Automating the repetitive parts doesn&rsquo;t replace your team; it gives them back the time to do the work that actually needs a human.',
  },
  covers: {
    heading: 'What we automate',
    cards: [
      { title: 'Client intake', body: 'Turn a form submission into a qualified lead, a CRM record and a first response &mdash; without anyone re-typing it.' },
      { title: 'App-to-app connections', body: 'Connect your website, CRM, accounting, scheduling and intake tools so data flows once, in one direction.' },
      { title: 'No more double entry', body: 'Stop copying the same customer details between apps &mdash; enter it once, everywhere it needs to go.' },
      { title: 'Approvals & notifications', body: 'Route approvals, reminders and hand-offs automatically, so nothing waits on someone remembering.' },
      { title: 'Reporting that builds itself', body: 'The numbers you check every week, assembled automatically instead of by hand.' },
      { title: 'Built on your real stack', body: 'We automate around the tools you already run &mdash; no rip-and-replace.' },
    ],
  },
  how: {
    heading: 'How it works',
    steps: [
      { title: 'Map your workflows', body: 'We walk through how the work actually moves today, and where the manual steps are.' },
      { title: 'Design the automation', body: 'We design the flows &mdash; what triggers what, and where a human still decides.' },
      { title: 'Build & connect', body: 'We connect the tools and build the automations against your live stack.' },
      { title: 'Train & optimise', body: 'We train your team, document it, and tune it over the first 90 days.' },
    ],
  },
  faqs: {
    heading: 'Frequently asked questions',
    items: [
      { q: 'What kinds of things can you automate?', a: 'Client intake, lead routing, data sync between apps, approvals, reminders, invoicing hand-offs and recurring reports are the common ones &mdash; but we start by mapping <em>your</em> workflows, not a template.' },
      { q: 'Which tools do you connect?', a: 'The tools you already run &mdash; CRMs, QuickBooks and other accounting, booking/scheduling systems, and intake forms. The point is to connect, not replace.' },
      { q: 'Will this break my current setup?', a: 'No &mdash; we map what you have first, build carefully, and stay on for a 90-day optimisation window to tune it against how you actually work.' },
      { q: 'How much time will I actually save?', a: 'A fully connected system typically saves clients 10&ndash;20 hours a month. The exact number depends on how much manual admin you&rsquo;re carrying today.' },
    ],
  },
  final: {
    heading: 'Get your week back.',
    body: 'Tell us where the manual work is and we&rsquo;ll scope what&rsquo;s worth automating.',
  },
};

export const metadata: Metadata = {
  title: 'Workflow Automation for Ontario Businesses | The Dot Creative',
  description: schemaDescription,
  keywords: 'workflow automation Ontario, small business automation, CRM integration, automate client intake, connect website to QuickBooks, business process automation Ontario',
  alternates: { canonical: `https://www.thedotcreative.co/services/${slug}` },
  openGraph: {
    title: 'Workflow Automation — Get Your Week Back',
    description: schemaDescription,
    url: `https://www.thedotcreative.co/services/${slug}`,
    siteName: 'The Dot Creative Agency',
    images: [{ url: '/images/The Dot Poster.webp', width: 1200, height: 630, alt: 'The Dot Creative Agency — Workflow Automation' }],
    locale: 'en_CA',
    type: 'website',
  },
  robots: { index: true, follow: true },
};

export default function Route() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema({ slug, name: 'Workflow Automation', serviceType: 'Business workflow automation', description: schemaDescription })) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema(data.faqs.items)) }} />
      <ServicePageLayout {...data} />
      <Footer />
    </>
  );
}
