// Shared JSON-LD builders for SP3 service landing pages. Server-usable (no
// 'use client'). FAQ text is stripped of the authored inline HTML so the schema
// carries plain text (per Google's structured-data policy: match visible text).

const ORIGIN = 'https://www.thedotcreative.co';

// Strip HTML tags AND decode the entities used in our copy, so the schema text
// matches the RENDERED visible text (Google's FAQ policy: they must match).
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&rsquo;/g, '’')
    .replace(/&lsquo;/g, '‘')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&agrave;/g, 'à')
    .replace(/&rarr;/g, '→')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function serviceSchema(opts: {
  slug: string;
  name: string;
  serviceType: string;
  description: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': `${ORIGIN}/services/${opts.slug}#service`,
    name: opts.name,
    serviceType: opts.serviceType,
    description: opts.description,
    provider: { '@id': `${ORIGIN}/#organization` },
    areaServed: { '@type': 'State', name: 'Ontario' },
    url: `${ORIGIN}/services/${opts.slug}`,
  };
}

export function breadcrumbSchema(slug: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Services', item: `${ORIGIN}/services` },
      { '@type': 'ListItem', position: 3, name, item: `${ORIGIN}/services/${slug}` },
    ],
  };
}

export function faqPageSchema(faqs: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: stripHtml(f.q),
      acceptedAnswer: { '@type': 'Answer', text: stripHtml(f.a) },
    })),
  };
}
