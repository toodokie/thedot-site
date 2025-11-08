import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Known malicious bot user agents
const BLOCKED_USER_AGENTS = [
  'LieBaoFast',
  'UCBrowser',
  'MQQBrowser',
  'Mb2345Browser',
  'MicroMessenger',
  'Baiduspider',
  'Sogou',
  '360Spider',
  'YisouSpider',
  'zh-CN',
  'zh_CN',
  // Generic scrapers
  'python-requests',
  'scrapy',
  'curl',
  'wget',
  'Bytespider', // TikTok bot
  'PetalBot', // Huawei bot
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the hostname (www.thedotcreative.co or thedotcreative.co)
  const hostname = request.headers.get('host') || '';

  // Bot protection: Check user agent
  const userAgent = request.headers.get('user-agent') || '';

  // Block known malicious bots
  const isBlockedBot = BLOCKED_USER_AGENTS.some(bot =>
    userAgent.toLowerCase().includes(bot.toLowerCase())
  );

  if (isBlockedBot) {
    // Return 403 Forbidden for blocked bots
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Optional: Block requests with no user agent (likely bots)
  if (!userAgent || userAgent.trim() === '') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Create response
  let response = NextResponse.next();
  
  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production' && request.headers.get('x-forwarded-proto') !== 'https') {
    return NextResponse.redirect(
      `https://${hostname}${pathname}`,
      301
    );
  }
  
  // Redirect non-www to www (consolidate to single domain)
  if (process.env.NODE_ENV === 'production' && !hostname.startsWith('www.') && !hostname.includes('localhost')) {
    return NextResponse.redirect(
      `https://www.${hostname}${pathname}${request.nextUrl.search}`,
      301
    );
  }
  
  // Add canonical header to help with SEO
  response.headers.set('Link', `<https://www.thedotcreative.co${pathname}>; rel="canonical"`);
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};