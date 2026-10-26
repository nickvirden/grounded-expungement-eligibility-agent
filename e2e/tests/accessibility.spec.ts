import { expect, test } from '@playwright/test';
import { gotoNode } from '../helpTree';

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

// axe is injected as an inline script, which the page's CSP would block.
test.use({ bypassCSP: true });

const RULES = [
  'color-contrast',
  'aria-progressbar-name',
  'page-has-heading-one',
  'landmark-no-duplicate-main',
  'landmark-main-is-top-level',
  'dlitem',
  'scrollable-region-focusable',
];

async function runAxe(page: import('@playwright/test').Page, rules: string[] = RULES) {
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
    rules,
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
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('after one answer (breadcrumb visible) has no violations', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    const firstButton = page.locator('button[aria-pressed]').first();
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

  test('loop exit state has no violations', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    // A question sequence that returns to one already answered, which the live tree never does.
    const question = (id: number) => ({
      is_terminal: false,
      next_question_id: id,
      next_question_text: `Mocked question ${id}`,
      next_question_help: null,
      next_answers: [{ value: `Answer to ${id}`, position: 1 }],
      questions_left: 3,
      traversed_path: [],
    });
    const responses = [question(1), question(2), question(1)];
    await page.route('**/eligibility/assess', async (route) => {
      const body = responses.shift();
      if (!body) throw new Error('assess called more often than the mock expects');
      await route.fulfill({ json: body });
    });
    // Each click waits for the previous mocked question, so a click lost before hydration fails
    // at the missing heading instead of timing out on a later step.
    for (const heading of [null, 'Mocked question 1', 'Mocked question 2']) {
      if (heading) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const button = page.locator('button[aria-pressed]').first();
      await expect(button).toBeEnabled({ timeout: 10_000 });
      await button.click();
    }

    await expect(page.getByRole('heading', { name: "We can't finish this check" })).toBeFocused();
    expectNoViolations(await runAxe(page, [...RULES, 'button-name', 'link-name', 'heading-order']));
  });
});

// The help dialog scans add the dialog, button and heading-order rules and the one-main check,
// which the shared set does not run on the other pages.
const HELP_RULES = [
  ...RULES,
  'aria-dialog-name',
  'button-name',
  'heading-order',
  'landmark-one-main',
];

test.describe('Accessibility — Quick Form help', () => {
  const viewports = [
    { name: 'desktop', size: { width: 1280, height: 800 } },
    { name: 'mobile', size: { width: 375, height: 812 } },
  ];
  // 0-0 short help, 11-11 a rule, 7-10 the long county list, 7-14 a quoted statute.
  for (const id of ['0-0', '11-11', '7-10', '7-14']) {
    for (const { name, size } of viewports) {
      test(`node ${id} at ${name} has no violations with help closed and open`, async ({
        page,
      }) => {
        await page.setViewportSize(size);
        await gotoNode(page, id);
        await expect(page.getByRole('button', { name: /^Help/ })).toBeVisible();
        expectNoViolations(await runAxe(page, HELP_RULES));

        await page.getByRole('button', { name: /^Help/ }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        expectNoViolations(await runAxe(page, HELP_RULES));
      });
    }
  }
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

test.describe('Accessibility — Not-found page', () => {
  test('has no violations', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    expectNoViolations(await runAxe(page));
  });

  test('home link is reachable by keyboard with a visible focus ring', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 });
    // First stop is the skip link, second is the home link.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const link = page.getByRole('link', { name: 'Go to the home page' });
    await expect(link).toBeFocused();
    await expect(link).toHaveCSS('outline-style', 'solid');
  });
});
