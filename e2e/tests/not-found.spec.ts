import { expect, test } from '../cspGuard';

/**
 * The not-found page replaces Next's built-in 404, whose inline <style> and
 * style attributes the nonce CSP blocks. These tests hold on both the dev
 * server and a production build.
 */

const MISSING = '/does-not-exist';

test.describe('Not-found page', () => {
  test('responds 404 with a nonce CSP', async ({ page }) => {
    const response = await page.goto(MISSING);
    expect(response?.status()).toBe(404);
    expect(response?.headers()['content-security-policy']).toContain("'nonce-");
  });

  test('renders styled, not with browser defaults', async ({ page }) => {
    await page.goto(MISSING);
    const heading = page.getByRole('heading', { level: 1, name: 'Page not found' });
    await expect(heading).toBeVisible();
    await expect(heading).toHaveCSS('font-weight', '800');
    await expect(page.getByRole('link', { name: 'Go to the home page' })).toHaveCSS(
      'background-color',
      'rgb(37, 99, 235)',
    );
  });

  test('has no elements with inline style attributes', async ({ page }) => {
    await page.goto(MISSING);
    await page.waitForLoadState('networkidle');

    // Framework-injected elements (dev overlay, portals, scripts) are excluded;
    // only application-owned elements are asserted on.
    const FRAMEWORK_TAGS = [
      'NOSCRIPT',
      'SCRIPT',
      'NEXTJS-PORTAL',
      'NEXT-ROUTE-ANNOUNCER',
      'NEXT-DEV-OVERLAY',
    ];
    const inlineStyled = await page.evaluate(
      (frameworkTags) =>
        Array.from(document.querySelectorAll('[style]'))
          .map((el) => ({ tag: el.tagName, id: el.id || null, style: el.getAttribute('style') }))
          .filter((item) => !frameworkTags.includes(item.tag)),
      FRAMEWORK_TAGS,
    );
    expect(inlineStyled).toHaveLength(0);
  });

  test('server-rendered style tags carry the response nonce', async ({ request }) => {
    const res = await request.get(MISSING);
    const csp = res.headers()['content-security-policy'] ?? '';
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    expect(nonce, 'nonce in CSP header').toBeTruthy();

    // Raw HTML rather than the DOM: browsers blank nonce attributes after parsing.
    const html = await res.text();
    const styleTags = html.match(/<style[^>]*data-styled[^>]*>/g) ?? [];
    expect(styleTags.length).toBeGreaterThan(0);
    for (const tag of styleTags) {
      expect(tag).toContain(`nonce="${nonce}"`);
    }
  });

  test('home link returns to the landing page', async ({ page }) => {
    await page.goto(MISSING);
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#state-select')).toBeVisible();
  });

  test('an unmatched intake state shows the same page', async ({ page }) => {
    const response = await page.goto('/intake/no-such-state/quick');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  });
});
