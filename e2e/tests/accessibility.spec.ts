import { expect, test } from '@playwright/test';

/**
 * Accessibility specification tests, driven by axe-core.
 *
 * Scoped to a fixed rule set rather than a full axe scan: axe's full ruleset
 * also runs rules that resolve to "needs review" rather than a clean
 * pass/fail (e.g. a color-contrast check that can't settle during a
 * mid-animation frame, or an aria-prohibited-attr check on a dynamically
 * built widget), which would make the suite flaky and require manual
 * triage instead of asserting the structural and contrast guarantees these
 * tests exist to enforce.
 */

const RULES = [
  'color-contrast',
  'aria-progressbar-name',
  'page-has-heading-one',
  'landmark-no-duplicate-main',
  'landmark-main-is-top-level',
  'dlitem',
  'scrollable-region-focusable',
];

async function runAxe(page: import('@playwright/test').Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

  // Let finite CSS animations (card fade-ins, slide-ins) settle before
  // measuring contrast, so a scan doesn't race a mid-transition opacity.
  // Infinite animations (loading dots, the typing cursor) never resolve, so
  // they're excluded rather than awaited.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished),
    ),
  );

  return page.evaluate(
    (runOnly) =>
      // @ts-expect-error -- axe is attached to window by the injected script
      window.axe.run(document, { runOnly }),
    RULES,
  );
}

function expectNoViolations(results: { violations: Array<{ id: string; nodes: unknown[] }> }) {
  expect(
    results.violations,
    JSON.stringify(
      results.violations.map((v) => ({ id: v.id, count: v.nodes.length })),
      null,
      2,
    ),
  ).toEqual([]);
}

test.describe('Accessibility — Quick Form', () => {
  test('initial load has no violations', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('after one answer (breadcrumb visible) has no violations', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });

    const firstButton = page.getByRole('button').first();
    await expect(firstButton).toBeEnabled({ timeout: 10_000 });
    await firstButton.click();

    if (page.url().includes('/result')) {
      // Terminal on the first answer -- nothing left to assert here, the
      // result page itself is covered separately.
      return;
    }

    await expect(page.getByRole('list', { name: /decision path so far/i })).toBeVisible({
      timeout: 10_000,
    });
    expectNoViolations(await runAxe(page));
  });
});

test.describe('Accessibility — Result page', () => {
  test('direct-URL load has no violations', async ({ page }) => {
    await page.goto(
      '/intake/texas/result?result_key=expungement&result_label=Texas+Expungement&state=texas&path=0:0,1:1',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('conditional-outcome load has no violations', async ({ page }) => {
    await page.goto(
      '/intake/texas/result?result_key=does_not_qualify_yet&result_label=Does+Not+Qualify+Yet&state=texas&path=0:0,1:1',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('negative-outcome load has no violations', async ({ page }) => {
    await page.goto(
      '/intake/texas/result?result_key=does_not_qualify&result_label=Does+Not+Qualify&state=texas&path=0:0,1:1',
    );
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });
});

test.describe('Accessibility — Talk to Agent', () => {
  test('initial load has no violations', async ({ page }) => {
    await page.goto('/intake/texas/talk');
    await expect(page.getByLabel('Message input')).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('after a report arrives (completed state) has no violations', async ({ page }) => {
    await page.goto('/intake/texas/talk');
    const textarea = page.getByLabel('Message input');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill('My charges were dismissed in 2010 and nothing else happened.');
    await page.getByRole('button', { name: 'Send message' }).click();

    await expect(page.getByLabel('Eligibility result')).toBeVisible({ timeout: 15_000 });
    expectNoViolations(await runAxe(page));
  });
});
