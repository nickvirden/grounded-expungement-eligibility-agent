/**
 * Builds the per-request Content-Security-Policy.
 *
 * Scripts and styles are authorised by a per-request nonce rather than
 * `'unsafe-inline'`, so injected markup cannot execute. `'strict-dynamic'`
 * lets nonced bootstrap scripts load the chunks they depend on.
 *
 * Development differs because React's dev tooling needs `eval` and the dev
 * server injects inline styles it cannot nonce, so styles are allowed inline;
 * `upgrade-insecure-requests` is dropped so plain-http localhost keeps working.
 */
export function buildCsp(nonce: string, isDev: boolean): string {
  const directives: string[] = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    // A nonce makes browsers ignore 'unsafe-inline', so the dev policy omits it.
    isDev ? "style-src 'self' 'unsafe-inline'" : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // The browser only calls same-origin /api/* route handlers; the server
    // proxies to the backend, so the API origin is never a connect target.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (!isDev) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}
