import { expect, test } from '@playwright/test';

/**
 * Frontend security specification tests.
 *
 * These tests assert runtime security properties of the rendered pages:
 *  1. No inline `style` attributes (enforces CSP `style-src 'nonce-...'` compatibility)
 *  2. PII pages (under /intake) carry Cache-Control: no-store
 *  3. Security headers are present on all responses
 *
 * NOTE: The static counterpart (scanning source for `style={{`) runs via
 * `node scripts/check-no-inline-styles.mjs` — see security test script below.
 */

const PAGES = [
  { path: '/', label: 'Landing page' },
  { path: '/intake/texas/quick', label: 'Quick Form' },
];

const PII_PAGES = [
  '/intake/texas/quick',
  '/intake/texas/result?result_key=expungement&result_label=Texas+Expungement&state=texas',
];

test.describe('No inline styles', () => {
  for (const { path, label } of PAGES) {
    test(`${label} has no elements with inline style attributes`, async ({ page }) => {
      await page.goto(path);
      // Wait for the page to fully render
      await page.waitForLoadState('networkidle');

      // Collect all elements with a style attribute, excluding framework-injected elements.
      // Next.js dev mode injects NEXTJS-PORTAL, NEXT-ROUTE-ANNOUNCER, and debug SCRIPT tags
      // with inline styles. We assert only on application-owned elements.
      const FRAMEWORK_TAGS = new Set([
        'NOSCRIPT',
        'SCRIPT',
        'NEXTJS-PORTAL',
        'NEXT-ROUTE-ANNOUNCER',
        'NEXT-DEV-OVERLAY',
      ]);

      const inlineStyled = await page.evaluate((frameworkTags) => {
        return Array.from(document.querySelectorAll('[style]'))
          .map((el) => ({
            tag: el.tagName,
            id: el.id || null,
            class: el.className || null,
            style: el.getAttribute('style'),
          }))
          .filter((item) => !frameworkTags.includes(item.tag));
      }, Array.from(FRAMEWORK_TAGS));

      if (inlineStyled.length > 0) {
        console.error('Elements with inline styles:', JSON.stringify(inlineStyled, null, 2));
      }
      expect(inlineStyled).toHaveLength(0);
    });
  }
});

test.describe('PII page cache headers', () => {
  for (const path of PII_PAGES) {
    test(`${path} has Cache-Control: no-store`, async ({ request }) => {
      const res = await request.get(path);
      const cacheControl = res.headers()['cache-control'] ?? '';
      expect(cacheControl.toLowerCase()).toContain('no-store');
    });
  }
});

test.describe('Security headers', () => {
  test('landing page has X-Frame-Options: DENY', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });

  test('landing page has X-Content-Type-Options: nosniff', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('API health endpoint has security headers', async ({ request }) => {
    const res = await request.get('http://localhost:8001/healthz');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('DENY');
  });
});
