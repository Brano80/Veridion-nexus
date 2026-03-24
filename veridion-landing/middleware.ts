import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Apex host redirects to www at the edge (Vercel). Google Search Console's sitemap
 * fetch for property https://veridion-nexus.eu/ does not reliably follow that redirect,
 * which shows as "Couldn't fetch". Rewrite apex /sitemap.xml internally to the www
 * route so the URL stays on apex but returns 200 + XML (no Location redirect).
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host')?.split(':')[0] ?? '';
  if (host !== 'veridion-nexus.eu') {
    return NextResponse.next();
  }
  if (request.nextUrl.pathname !== '/sitemap.xml') {
    return NextResponse.next();
  }
  const url = request.nextUrl.clone();
  url.hostname = 'www.veridion-nexus.eu';
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: '/sitemap.xml',
};
