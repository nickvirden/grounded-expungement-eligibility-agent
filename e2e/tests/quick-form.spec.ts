import { expect, test } from '@playwright/test';

/**
 * Quick Form happy-path E2E test.
 *
 * Path traced through Texas decision tree:
 *   Entry → Q1 (outcome of record)
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
    const questionHeading = page.locator('h2');
    await expect(questionHeading).toBeVisible({ timeout: 10_000 });

    // There must be at least two answer options
    const answerButtons = page.getByRole('button');
    const count = await answerButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Progress bar is present and accessible
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
  });

  test('completes the one-step expungement path and shows result', async ({ page }) => {
    await page.goto('/intake/texas/quick');

    // Wait for first question to load
    await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });

    // Answer position 1: "I was acquitted, pardoned, or my conviction was overturned on appeal"
    // The button text comes from the Texas JSON tree node 1, answer[1]
    const acquittedButton = page.getByRole('button', {
      name: /acquitted|pardoned|overturned/i,
    });
    // Allow extra time for Turbopack first-compile on CI
    await expect(acquittedButton).toBeVisible({ timeout: 15_000 });
    await acquittedButton.click();

    // Should navigate to result page
    await page.waitForURL(/\/intake\/texas\/result/, { timeout: 10_000 });

    // Result page should show a positive outcome
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // "Expungement" should appear somewhere on the page
    await expect(page.getByText(/expungement/i).first()).toBeVisible();
  });

  test('back button returns to landing page', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('progress bar advances after answering a question', async ({ page }) => {
    await page.goto('/intake/texas/quick');
    await expect(page.locator('h2')).toBeVisible({ timeout: 10_000 });

    const progressBar = page.locator('[role="progressbar"]');
    const initialValue = await progressBar.getAttribute('aria-valuenow');

    // Click first answer (position 0 — goes to next question or terminal)
    const firstButton = page.getByRole('button').first();
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
