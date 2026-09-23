import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { incrementBotBlocks } from './lib/security-stats';
import { checkAdminMiddlewareSession, mintAdminSession, ADMIN_SESSION_HOURS } from './lib/admin-middleware-auth';
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

  // Every /admin route except the login and its API is session-guarded here.
  // /admin/dashboard used to be excluded, which let it render for anyone AND be
  // served from the shared CDN cache (x-vercel-cache: HIT with no cookie). That
  // both exposed the page and hid a failed sign-in: the dashboard looked logged
  // in, then /admin/portal correctly rejected the request, which read to the
  // operator as a login loop. Guard the whole tree, never just the portal.
  const isAdminRoute = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPublicAdminRoute = pathname === '/admin/login' || pathname.startsWith('/admin/auth/');
  const isGuardedAdminRoute = isAdminRoute && !isPublicAdminRoute;
  let refreshedAdminSession: string | null = null;
  if (isGuardedAdminRoute) {
    const check = await checkAdminMiddlewareSession(request);
    if (check.state !== 'valid') {
      // Say WHY on the login screen and carry the page back. Landing on a bare password form with
      // no explanation is what made an expired session read as "Ops is broken": every page you had
      // already opened kept rendering from the browser's cache, so only the next new page bounced,
      // which looks like one broken page rather than a session that ran out.
      const login = new URL('/admin/login', request.url);
      if (check.state !== 'absent') login.searchParams.set('error', check.state);
      login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      const response = NextResponse.redirect(login, 307);
      response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
      response.headers.set('Link', `<https://www.thedotcreative.co${pathname}>; rel="canonical"`);
      return response;
    }
    // Sliding session. The old fixed 12 hours expired mid-work with no warning and no way back to
    // where you were, however recently you had used it.
    if (check.shouldRefresh) refreshedAdminSession = await mintAdminSession();
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
      // Carry the page she was actually trying to open. Without this, a piece link copied out of
      // the portal and sent to her signed her in and then dropped her on the workspace landing,
      // which read as the link going somewhere else entirely. Every later hop re-validates the
      // destination with safeNext, so this cannot become an open redirect.
      const loginUrl = new URL('/client/login', request.url);
      if (pathname !== '/client') {
        loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
      }
      response = NextResponse.redirect(loginUrl, 307);
      response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    }
  }

  // No admin page is ever shared-cacheable. The dashboard is a client component, so it
  // prerenders and was being served from the CDN with `public` caching and no session
  // (x-vercel-cache: HIT). Even behind the guard above, a cached copy must never be
  // handed to a second person or replayed from the browser after sign-out.
  if (isAdminRoute) {
    response.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
  }
  if (refreshedAdminSession) {
    response.cookies.set('session', refreshedAdminSession, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      // Lax, not Strict. Strict withholds the cookie on any top-level navigation that arrives from
      // another site, so opening an Ops link from anywhere outside the site bounced to login even
      // with a perfectly good session, and a reload then "fixed" it. Lax still withholds it from
      // cross-site POSTs, which is the CSRF protection that matters here.
      sameSite: 'lax',
      expires: new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000),
      path: '/',
    });
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
