import { expect, test } from '../cspGuard';

/**
 * The not-found page replaces Next's built-in 404, whose inline <style> and
 * style attributes the nonce CSP blocks. These tests hold on both the dev
 * server and a production build. Unmatched /api/* requests are the other case:
 * they answer JSON under the fixed /api CSP instead of the page.
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

test.describe('Unmatched API route', () => {
  test('answers 404 JSON under the locked-down API CSP', async ({ request }) => {
    const res = await request.get('/api/nope');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
    expect(await res.json()).toEqual({ detail: 'Not Found' });

    const csp = res.headers()['content-security-policy'];
    expect(csp).toBe("default-src 'none'; frame-ancestors 'none'");
    expect(csp).not.toContain('nonce-');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });

  test('answers 404, not 403, to a POST from a foreign origin', async ({ request }) => {
    const res = await request.post('/api/nope', { headers: { Origin: 'https://evil.example' } });
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ detail: 'Not Found' });
  });

  test('answers 404 JSON for an unknown path under /api/chat', async ({ request }) => {
    const res = await request.get('/api/chat/x');
    expect(res.status()).toBe(404);
    expect(res.headers()['content-type']).toContain('application/json');
  });

  test('does not shadow the proxy route', async ({ request }) => {
    const res = await request.get('/api/backend/api/states');
    expect(res.status()).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  test('does not shadow the chat route', async ({ request }) => {
    const res = await request.post('/api/chat');
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: 'Origin not allowed' });
  });
});
