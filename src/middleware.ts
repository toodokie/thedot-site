import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { incrementBotBlocks } from './lib/security-stats';
import { hasValidAdminMiddlewareSession } from './lib/admin-middleware-auth';
import { refreshPortalSession } from '@/lib/supabase/middleware';
import { isAuthRetryableFetchError, type AuthError } from '@supabase/auth-js';

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

function isPortalAuthUnavailable(error: AuthError | null) {
  if (!error) return false;
  return isAuthRetryableFetchError(error)
    || error.status === 0
    || error.status === 429
    || error.status >= 500;
}

function portalUnavailableResponse(pathname: string) {
  const response = new NextResponse(
    'The client portal is temporarily unavailable. Please try again in a few seconds.',
    { status: 503 },
  );
  response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  response.headers.set('Retry-After', '5');
  response.headers.set('Link', `<https://www.thedotcreative.co${pathname}>; rel="canonical"`);
  return response;
}

export async function middleware(request: NextRequest) {
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
    // Track bot block for admin dashboard
    incrementBotBlocks();
    // Return 403 Forbidden for blocked bots
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Optional: Block requests with no user agent (likely bots)
  if (!userAgent || userAgent.trim() === '') {
    // Track bot block for admin dashboard
    incrementBotBlocks();
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Force HTTPS in production
  if (process.env.NODE_ENV === 'production' && request.headers.get('x-forwarded-proto') !== 'https') {
    return NextResponse.redirect(
      `https://${hostname}${pathname}${request.nextUrl.search}`,
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

  const isAdminPortalRoute = pathname === '/admin/portal' || pathname.startsWith('/admin/portal/');
  if (isAdminPortalRoute && !(await hasValidAdminMiddlewareSession(request))) {
    const response = NextResponse.redirect(new URL('/admin/login', request.url), 307);
    response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    response.headers.set('Link', `<https://www.thedotcreative.co${pathname}>; rel="canonical"`);
    return response;
  }

  // Refresh the portal session on /client and /client/* only; plain pass-through elsewhere
  // (startsWith('/client') would also match /clientele, /clients, etc.)
  const isPortalRoute = pathname === '/client' || pathname.startsWith('/client/');
  const isPublicPortalRoute = pathname === '/client/login'
    || pathname === '/client/logout'
    || pathname.startsWith('/client/auth/');
  let response = NextResponse.next();
  if (isPortalRoute && !isPublicPortalRoute) {
    let portalSession;
    try {
      portalSession = await refreshPortalSession(request);
    } catch {
      return portalUnavailableResponse(pathname);
    }
    response = portalSession.response;
    if (isPortalAuthUnavailable(portalSession.error)) {
      return portalUnavailableResponse(pathname);
    }
    if (!portalSession.userId) {
      response = NextResponse.redirect(new URL('/client/login', request.url), 307);
      response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    }
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
