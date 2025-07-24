import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, protocol, host } = request.nextUrl;
  
  // Get the hostname (www.thedotcreative.co or thedotcreative.co)
  const hostname = request.headers.get('host') || '';
  
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