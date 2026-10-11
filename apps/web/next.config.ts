import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  compiler: {
    styledComponents: true,
  },
  // Strict mode for better React 19 compatibility
  reactStrictMode: true,
  // Security: do not expose X-Powered-By header
  poweredByHeader: false,
  // The page Content-Security-Policy is set per request in src/middleware.ts
  // because its nonce cannot be a static header. /api responses get theirs below.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Caddy sets this for the Docker Compose deploy; Vercel has no
          // equivalent reverse-proxy layer, so it must be set here too.
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // No popups, iframes or cross-origin embeds exist, so full isolation is free.
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        // Middleware skips /api; these are JSON/SSE responses that never render.
        source: '/api/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "default-src 'none'; frame-ancestors 'none'" },
        ],
      },
      {
        // PII pages must never be cached — by browser, CDN, or proxy
        source: '/intake/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
        ],
      },
    ];
  },
};

export default nextConfig;
