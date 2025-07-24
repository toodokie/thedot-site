export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.thedotcreative.co'
  
  const robotsTxt = `# Robots.txt for The Dot Creative
User-agent: *
Allow: /
Disallow: /api/
Disallow: /brief/results
Disallow: /blog/tag/
Disallow: /project/
Disallow: /press/
Disallow: /projects-eng/
Disallow: /favicon.ico
Disallow: /favicon.png
Disallow: /*.ico
Disallow: /*.png
Crawl-delay: 1

# Sitemap location
Sitemap: ${baseUrl}/sitemap.xml

# Canonical host
Host: ${baseUrl}

# Google specific
User-agent: Googlebot
Allow: /
Crawl-delay: 0

# Block AI scrapers (optional)
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /
`

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}