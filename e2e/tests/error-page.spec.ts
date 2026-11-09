import { expect, test } from '../cspGuard';
import { webMode } from '../webMode';

/**
 * The error boundary, against the second production web server whose API is unreachable
 * (see playwright.config.ts). The quick form's server fetch fails there, so the route
 * renders app/error.tsx for real. Production only: the dev server's error overlay and
 * relaxed CSP are not what ships.
 */

test.skip(
  webMode !== 'production',
  'needs the broken-API web server, started in production mode only',
);

test.use({ baseURL: 'http://127.0.0.1:3001' });

const BROKEN = '/intake/texas/quick';

test.describe('Error page', () => {
  test('an unreachable API is a 500 error page, not a 404', async ({ page }) => {
    const response = await page.goto(BROKEN);
    expect(response?.status()).toBe(500);
    const heading = page.getByRole('heading', { level: 1, name: 'Something went wrong' });
    await expect(heading).toBeVisible();
    await expect(page.getByText('Page not found')).toHaveCount(0);
    await expect(page).toHaveTitle('Something went wrong | ClearSlate');
  });

  test('renders styled and moves focus to the heading', async ({ page }) => {
    await page.goto(BROKEN);
    const heading = page.getByRole('heading', { level: 1, name: 'Something went wrong' });
    await expect(heading).toBeFocused();
    await expect(heading).toHaveCSS('font-weight', '800');
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCSS(
      'background-color',
      'rgb(37, 99, 235)',
    );
    // Next's own route announcer is an alert outside <main>; the page must not add another.
    await expect(page.locator('main').getByRole('alert')).toHaveCount(0);
  });

  test('exposes neither a digest nor error text', async ({ page }) => {
    await page.goto(BROKEN);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text).not.toContain('digest');
    expect(text).not.toContain('entry request failed');
    expect(text).not.toContain('econnrefused');
    expect(text).not.toContain('fetch failed');
  });

  test('Try again shows the error page again without looping', async ({ page }) => {
    await page.goto(BROKEN);
    const retry = page.getByRole('button', { name: 'Try again' });
    await expect(retry).toBeEnabled();

    let requests = 0;
    page.on('request', (r) => {
      if (r.url().includes('/intake/texas/quick')) requests += 1;
    });

    // A retry refreshes the route, which is one RSC request for the page.
    const refresh = page.waitForRequest((r) => r.url().includes('/intake/texas/quick'));
    await retry.click();
    await refresh;
    await expect(retry).toBeEnabled();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeVisible();

    // A retry is one refresh; a render loop would keep issuing requests.
    const afterClick = requests;
    await page.waitForTimeout(1_000);
    expect(requests).toBe(afterClick);
    expect(afterClick).toBeGreaterThan(0);
    expect(afterClick).toBeLessThanOrEqual(2);
  });

  test('home link returns to the landing page', async ({ page }) => {
    await page.goto(BROKEN);
    await page.getByRole('link', { name: 'Go to the home page' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#state-select')).toBeVisible();
  });
});
