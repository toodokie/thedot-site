export const dynamic = 'force-static';

export async function GET() {
  // Canonical production host — hardcoded so it never picks up a preview
  // domain (e.g. *.vercel.app) from NEXT_PUBLIC_BASE_URL.
  const baseUrl = 'https://www.thedotcreative.co';

  const robotsTxt = `# Robots.txt for The Dot Creative
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /client
Disallow: /brief/results
Disallow: /blog/tag/

# AI search crawlers are intentionally allowed (kept in sync with middleware)
# so the site can be discovered and cited by AI answer engines.

Sitemap: ${baseUrl}/sitemap.xml
`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
