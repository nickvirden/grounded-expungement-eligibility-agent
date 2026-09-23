import { expect, test } from '@playwright/test';

/**
 * Talk-to-Agent E2E test.
 *
 * Covers the full token round trip that Quick Form doesn't need at all:
 *   POST /api/chat → create intake, receive stream_token
 *   → GET /api/chat/[id]/stream with Authorization: Bearer <token>
 *   → deterministic testmodel result rendered in the Case File panel.
 *
 * The negative case strips stream_token out of the create response (by
 * intercepting it, not by disabling anything server-side) so the client
 * genuinely sends no Authorization header -- the same shape of request a
 * stripped/dropped header would produce -- and asserts the chat UI shows a
 * visible error instead of hanging silently.
 */

const NARRATIVE = 'My charges were dismissed in 2010 and nothing else happened.';

test.describe('Talk to Agent — Texas happy path', () => {
  test('creates an intake, streams a response, and shows the deterministic result', async ({
    page,
  }) => {
    await page.goto('/intake/texas/talk');

    const textarea = page.getByLabel('Message input');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill(NARRATIVE);
    await page.getByRole('button', { name: 'Send message' }).click();

    // The agent bubble streams in, then the Case File panel picks up the
    // final report once the `final` SSE event arrives.
    await expect(page.getByLabel('Agent message')).toBeVisible({ timeout: 10_000 });

    const result = page.getByLabel('Eligibility result');
    await expect(result).toBeVisible({ timeout: 15_000 });
    await expect(result).toContainText('Texas');

    await expect(page.getByText('Complete')).toBeVisible();
  });
});

test.describe('Talk to Agent — missing Authorization header', () => {
  test('shows a visible error instead of a silent hang', async ({ page }) => {
    // Simulates a stripped/dropped Authorization header: the create
    // response reaches the client with stream_token removed, so
    // useChatStream has nothing to send and the API's stream route refuses
    // the request with 401.
    await page.route('**/api/chat', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, stream_token: null } });
    });

    await page.goto('/intake/texas/talk');

    const textarea = page.getByLabel('Message input');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await textarea.fill(NARRATIVE);
    await page.getByRole('button', { name: 'Send message' }).click();

    // Scoped to the chat error banner's own text -- Next.js's dev-mode route
    // announcer also carries role="alert", but stays empty, so matching on
    // content (not just the role) is what actually targets our banner.
    const alert = page.getByRole('alert').filter({ hasText: /session/i });
    await expect(alert).toBeVisible({ timeout: 10_000 });

    // No case file result ever appears -- the failure is visible, not silent.
    await expect(page.getByLabel('Eligibility result')).toHaveCount(0);
  });
});
