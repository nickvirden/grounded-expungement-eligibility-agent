import { buildCsp } from '@/lib/buildCsp';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Sets a per-request nonce CSP. The nonce cannot live in next.config.ts
 * because static headers are identical for every response. Next reads the
 * nonce from the request's CSP header and applies it to its own scripts; the
 * layout reads `x-nonce` to nonce styled-components' style tags.
 */
export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce, process.env.NODE_ENV === 'development');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  matcher: [
    {
      // /api responses are JSON/SSE and get a static CSP from next.config.ts.
      source: '/((?!api|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
