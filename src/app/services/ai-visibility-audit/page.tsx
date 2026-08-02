import type { Metadata } from 'next';
import AiVisibilityAuditPage from '@/components/AiVisibilityAuditPage';
import Footer from '@/components/Footer';
import { breadcrumbSchema } from '@/lib/service-schema';

export const metadata: Metadata = {
  title: 'AI-Visibility (GEO) Audit: Get Recommended by ChatGPT | The Dot Creative',
  description:
    'Find out whether ChatGPT, Gemini and Perplexity recommend your business, and fix what keeps AI from naming you. An AI-visibility (GEO) audit for Ontario businesses.',
  keywords:
    'AI visibility audit, GEO, generative engine optimization, AEO, answer engine optimization, get recommended by ChatGPT, AI search optimization Ontario, Toronto GEO agency',
  alternates: { canonical: 'https://www.thedotcreative.co/services/ai-visibility-audit' },
  openGraph: {
    title: 'AI-Visibility (GEO) Audit: Get Recommended by ChatGPT',
    description:
      'Find out whether ChatGPT, Gemini and Perplexity recommend your business, and fix what keeps AI from naming you.',
    url: 'https://www.thedotcreative.co/services/ai-visibility-audit',
    siteName: 'The Dot Creative Agency',
    images: [{ url: '/images/The Dot Poster.webp', width: 1200, height: 630, alt: 'The Dot Creative Agency AI-Visibility Audit' }],
    locale: 'en_CA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AI-Visibility (GEO) Audit: Get Recommended by ChatGPT',
    description: 'Find out whether ChatGPT, Gemini and Perplexity recommend your business.',
    images: ['/images/The Dot Poster.webp'],
  },
  robots: { index: true, follow: true },
};

const serviceSchema = {
  '@context': 'https://schema.org',
  '@type': 'Service',
  '@id': 'https://www.thedotcreative.co/services/ai-visibility-audit#service',
  name: 'AI-Visibility (GEO) Audit',
  serviceType: 'Generative Engine Optimization (GEO)',
  description:
    'An AI-visibility audit that checks whether ChatGPT, Gemini and Perplexity recommend your business, by name and by need, and whether AI can read your site, then fixes the gaps and monitors the result.',
  provider: { '@id': 'https://www.thedotcreative.co/#organization' },
  areaServed: { '@type': 'State', name: 'Ontario' },
  url: 'https://www.thedotcreative.co/services/ai-visibility-audit',
};

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is AI visibility / GEO?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'GEO (Generative Engine Optimization, also called AEO) is making sure AI assistants like ChatGPT, Gemini and Perplexity can find, understand and recommend your business when someone asks them for one like yours.',
      },
    },
    {
      '@type': 'Question',
      name: 'How is this different from SEO?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'SEO gets you ranked in a list of links. GEO gets you named inside an AI answer, which increasingly happens before anyone sees a list of links at all. They overlap, but the signals AI relies on (clear entity, structured data, answer-ready content) need deliberate work.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can you guarantee I’ll appear in ChatGPT?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'No, and be wary of anyone who does. AI answers are probabilistic and change over time. We remove the reasons AI overlooks you and measure the change with documented prompts, dates and sources.',
      },
    },
    {
      '@type': 'Question',
      name: 'Which AI engines do you check?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'ChatGPT, Google’s Gemini and AI answers, and Perplexity: the assistants your customers are most likely to ask.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where do I start?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Run the free check to see where you stand today, then book a full audit if you want the deeper analysis and fixes.',
      },
    },
  ],
};

export default function AiVisibilityAuditRoute() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema('ai-visibility-audit', 'AI-Visibility Audit')) }} />
      <AiVisibilityAuditPage />
      <Footer />
    </>
  );
}
