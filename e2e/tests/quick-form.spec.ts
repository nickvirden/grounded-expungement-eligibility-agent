import type { Page } from '@playwright/test';
import { expect, test } from '../cspGuard';

/**
 * Quick Form happy-path E2E test.
 *
 * Path traced through Texas decision tree:
 *   Entry (root case picker) → answer position 0: "I was arrested, but it didn't
 *   end up resulting in a conviction" → Q1 (outcome of record)
 *   Answer position 1: "I was acquitted, pardoned, or my conviction was overturned on appeal"
 *   → Terminal result: "Texas Expungement"
 *
 * Requirements exercised:
 *   - Landing page loads with Texas in state picker
 *   - Quick Form card navigates to /intake/texas/quick
 *   - First question is server-rendered (present before JS hydration)
 *   - Clicking an answer calls the rule engine and advances the stepper
 *   - Terminal result navigates to the result page with correct outcome
 */

test.describe('Quick Form — Texas happy path', () => {
  test('landing page shows state picker and mode cards', async ({ page }) => {
    await page.goto('/');

    // State picker is visible
    const stateSelect = page.locator('#state-select');
    await expect(stateSelect).toBeVisible({ timeout: 10_000 });

    // Initial value is empty (no state selected)
    await expect(stateSelect).toHaveValue('');

    // Wait for options to hydrate (SSR + React hydration)
    await expect(stateSelect.locator('option[value="texas"]')).toBeAttached({ timeout: 10_000 });

    // Select Texas
    await stateSelect.selectOption('texas');

    // Mode cards become visible
    await expect(page.getByText('Quick Form')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Talk to Agent')).toBeVisible();
  });

  test('navigates to quick form and server-renders first question', async ({ page }) => {
    await page.goto('/intake/texas/quick');

    // First question is present in the initial HTML (SSR)
    const questionHeading = page.getByRole('heading', { level: 2 });
    await expect(questionHeading).toBeVisible({ timeout: 10_000 });

    // There must be at least two answer options
    const answerButtons = page.getByRole('button');
    const count = await answerButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Progress bar is present and accessible
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
  });

  test('completes the two-step expungement path and shows result', async ({ page }) => {
    await page.goto('/intake/texas/quick');

    // Wait for the root question to load
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    // Root answer position 0: "I was arrested, but it didn't end up resulting in a conviction"
    const notConvictedButton = page.getByRole('button', {
      name: /didn't end up resulting in a conviction/i,
    });
    // Allow extra time for Turbopack first-compile on CI
    await expect(notConvictedButton).toBeVisible({ timeout: 15_000 });
    await notConvictedButton.click();

    // Answer position 1: "I was acquitted, pardoned, or my conviction was overturned on appeal"
    const acquittedButton = page.getByRole('button', {
      name: /acquitted|pardoned|overturned/i,
    });
    await expect(acquittedButton).toBeVisible({ timeout: 10_000 });
    await acquittedButton.click();

    // Should navigate to result page
    await page.waitForURL(/\/intake\/texas\/result/, { timeout: 10_000 });

    // Result page should show a positive outcome
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // "Expungement" should appear somewhere on the page
    await expect(page.getByText(/expungement/i).first()).toBeVisible();

    // The decision path region shows the actual question/answer text the user
    // saw, not raw questionId:answerPosition codes.
    const pathRegion = page.getByRole('region', { name: /decision path/i });
    await expect(pathRegion).toBeVisible();
    await expect(pathRegion).toContainText(/what best describes this texas case/i);
    await expect(pathRegion).toContainText(/didn't end up resulting in a conviction/i);
    const pathText = await pathRegion.innerText();
    expect(pathText).not.toMatch(/\bq?\d+:a?\d+\b/);
  });

  test('result page loaded directly via URL (no stepper interaction) still decodes the path', async ({
    page,
  }) => {
    await page.goto(
      '/intake/texas/result?result_key=expungement&result_label=Texas+Expungement&state=texas&path=0:0,1:1',
    );

    const pathRegion = page.getByRole('region', { name: /decision path/i });
    await expect(pathRegion).toBeVisible({ timeout: 10_000 });
    await expect(pathRegion).toContainText(/what best describes this texas case/i);
    await expect(pathRegion).toContainText(/didn't end up resulting in a conviction/i);
    const pathText = await pathRegion.innerText();
    expect(pathText).not.toMatch(/\bq?\d+:a?\d+\b/);
  });

  test('an unparseable path segment renders as literal text without breaking the rest of the path', async ({
    page,
  }) => {
    await page.goto(
      '/intake/texas/result?result_key=expungement&result_label=Texas+Expungement&state=texas&path=0:0,not-a-step',
    );

    const pathRegion = page.getByRole('region', { name: /decision path/i });
    await expect(pathRegion).toBeVisible({ timeout: 10_000 });
    await expect(pathRegion).toContainText(/what best describes this texas case/i);
    await expect(pathRegion).toContainText('not-a-step');
  });

  test('"no charges were filed" branch reaches a correctly-paired question', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    // Root answer position 0 leads to the "outcome of the criminal record" question.
    const notConvictedButton = page.getByRole('button', {
      name: /didn't end up resulting in a conviction/i,
    });
    await expect(notConvictedButton).toBeVisible({ timeout: 15_000 });
    await notConvictedButton.click();

    // The breadcrumb is a named list showing the answer just given, not a raw code.
    const breadcrumb = page.getByRole('list', { name: /decision path so far/i });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb).toContainText(/didn't end up resulting in a conviction/i);
    const breadcrumbText = await breadcrumb.innerText();
    expect(breadcrumbText).not.toMatch(/\bq?\d+:a?\d+\b/);

    // Answer position 2: "After being arrested, no charges were filed"
    const noChargesButton = page.getByRole('button', { name: /no charges were filed/i });
    await expect(noChargesButton).toBeVisible({ timeout: 10_000 });
    await noChargesButton.click();

    // This question/answer pair is only correctly paired once node identity
    // accounts for question variant, not just question group number.
    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      /which best describes the offense you were arrested for/i,
    );
    await expect(page.getByRole('button', { name: /^felony$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /class a or b misdemeanor/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /class c misdemeanor/i })).toBeVisible();
  });

  test('renders both distinct answers that share the same underlying position', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    // Click path: convicted as adult → felony → something else → no sex-offender
    // registration → not on that crime list → no jail/prison sentence. Reaches
    // "Are you currently on any of the following types of probation?", where two
    // distinct answers share the same legacy answer position.
    const clicks = [
      /^i was convicted as an adult$/i,
      /yes, the conviction we're currently evaluating was for a felony/i,
      /no, my felony conviction was for something else/i,
      /no, my conviction did not require me to register as a sex offender/i,
      /no, this conviction was not for a crime on that list/i,
      /no, the judge didn't sentence me to jail or prison/i,
    ];
    for (const name of clicks) {
      const button = page.getByRole('button', { name });
      await expect(button).toBeVisible({ timeout: 15_000 });
      await button.click();
    }

    await expect(page.getByRole('heading', { level: 2 })).toContainText(
      /currently.*on any of the following types of probation/i,
    );

    const completedSupervision = page.getByRole('button', {
      name: /successfully completed community supervision/i,
    });
    const neverOnProbation = page.getByRole('button', {
      name: /never put on any type of probation/i,
    });
    // Both answers are independently present and enabled, despite sharing a
    // position -- a React key collision would otherwise merge or drop one.
    await expect(completedSupervision).toBeVisible();
    await expect(neverOnProbation).toBeVisible();
    await expect(completedSupervision).toBeEnabled();
    await expect(neverOnProbation).toBeEnabled();

    await completedSupervision.click();
    await page.waitForTimeout(100); // let the click's state update settle before reading console

    expect(consoleErrors.filter((e) => /key/i.test(e))).toEqual([]);
  });

  test('back button returns to landing page', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('progress bar advances after answering a question', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });

    const progressBar = page.locator('[role="progressbar"]');
    const initialValue = await progressBar.getAttribute('aria-valuenow');

    // Click first answer (position 0 — goes to next question or terminal)
    const firstButton = page.locator('button[aria-pressed]').first();
    await expect(firstButton).toBeEnabled({ timeout: 10_000 });
    await firstButton.click();

    // After the API responds, one of two things must happen:
    //   a) Navigate to /result (terminal) — progress is moot
    //   b) aria-valuenow updates to a value > 0 (non-terminal, stepped forward)
    // We use Playwright's built-in retry so we don't race the React re-render.
    const isOnResultPage = page.url().includes('/result');
    if (!isOnResultPage) {
      await expect(progressBar).not.toHaveAttribute('aria-valuenow', String(initialValue ?? 0), {
        timeout: 5_000,
      });
      const newValue = await progressBar.getAttribute('aria-valuenow');
      expect(Number(newValue)).toBeGreaterThan(Number(initialValue));
    }
  });
});

// The live Texas tree has no cycle, so the loop exit is reached by mocking the assess endpoint
// with a question sequence that returns to one already answered.
test.describe('Quick Form — loop exit', () => {
  const question = (id: number, text: string) => ({
    is_terminal: false,
    next_question_id: id,
    next_question_text: text,
    next_question_help: null,
    next_answers: [
      { value: `Yes to ${text}`, position: 1 },
      { value: `No to ${text}`, position: 2 },
    ],
    questions_left: 5,
    traversed_path: [],
  });

  async function mockCycle(page: Page) {
    const responses = [
      question(1, 'Mocked question X'),
      question(2, 'Mocked question Y'),
      question(1, 'Mocked question X'),
    ];
    await page.route('**/eligibility/assess', async (route) => {
      const body = responses.shift();
      if (!body) throw new Error('assess called more often than the mock expects');
      await route.fulfill({ json: body });
    });
  }

  // Waits for each mocked question to render before the next click, so a click lost before
  // hydration fails at the missing heading instead of timing out on a later step.
  async function answerThroughCycle(page: Page) {
    for (const heading of [null, 'Mocked question X', 'Mocked question Y']) {
      if (heading) await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      const button = page.locator('button[aria-pressed]').first();
      await expect(button).toBeEnabled({ timeout: 15_000 });
      await button.click();
    }
  }

  test('a question that comes back ends the form with an explanation and a way out', async ({
    page,
  }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });
    await mockCycle(page);
    await answerThroughCycle(page);

    const heading = page.getByRole('heading', { name: "We can't finish this check" });
    await expect(heading).toBeFocused();
    await expect(page.getByText(/led back to a question you already answered/i)).toBeVisible();
    await expect(page.locator('button[aria-pressed]')).toHaveCount(0);
    await expect(page.getByText('3 answered', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: /decision path so far/i })).toBeVisible();

    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Start over' })).toBeFocused();
    await page.keyboard.press('Tab');
    const talk = page.getByRole('link', { name: 'Talk to the agent instead' });
    await expect(talk).toBeFocused();
    await expect(talk).toHaveAttribute('href', '/intake/texas/talk');
  });

  test('Start over shows the entry question again with the path cleared', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    const heading = page.getByRole('heading', { level: 2 });
    await expect(heading).toBeVisible({ timeout: 10_000 });
    const entryText = await heading.innerText();
    await mockCycle(page);
    await answerThroughCycle(page);

    await page.getByRole('button', { name: 'Start over' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(entryText);
    await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(page.getByRole('list', { name: /decision path so far/i })).toHaveCount(0);
    await expect(page.locator('button[aria-pressed]').first()).toBeEnabled();
  });

  test('a path with no repeated question is unaffected', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /didn't end up resulting in a conviction/i }).click();
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/outcome|criminal record/i);
    await expect(page.getByRole('heading', { name: "We can't finish this check" })).toHaveCount(0);
  });
});
