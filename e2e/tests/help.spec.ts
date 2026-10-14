import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../cspGuard';
import { gotoNode, nodeHasHelp } from '../helpTree';

/**
 * Help dialog and "How to answer" box, driven through the real Quick Form.
 *
 * Nodes are reached by clicking the real answer buttons along a path computed from the
 * committed tree (see helpTree.ts). Node ids used below: 0-0 (short title, no rule), 11-11
 * (a rule in the first paragraph), 12-3 (a rule that contradicts its question), 2-6 (no help),
 * 7-10 (84 counties), 4-11 (a numbered list) and 7-14 (a quoted statute).
 */

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const LANDSCAPE_PHONE = { width: 667, height: 375 };

const LEDGER_PATH = join(__dirname, '../../apps/web/src/lib/helpRuleLedger.json');
const ledgerKeys = (): string[] =>
  Object.keys(JSON.parse(readFileSync(LEDGER_PATH, 'utf8')).entries ?? {});
const reviewedNodeIds = ledgerKeys()
  .filter((key) => key.startsWith('texas:'))
  .map((key) => key.slice('texas:'.length));

const trigger = (page: Page) => page.getByRole('button', { name: /^Help/ });
const dialog = (page: Page) => page.getByRole('dialog');
const answerButtons = (page: Page) => page.locator('button[aria-pressed]');
const answerBox = (page: Page) => page.getByText('How to answer', { exact: true });

async function openByClick(page: Page): Promise<Locator> {
  await trigger(page).click();
  const d = dialog(page);
  await expect(d).toBeVisible();
  // Measure the settled layout, not the sheet mid-slide.
  await d.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return d;
}

const scrollY = (page: Page) => page.evaluate(() => window.scrollY);

test.describe('Help dialog: trigger and opening', () => {
  test.use({ viewport: MOBILE });

  test('the Help button is a named popup trigger and the answers stay on screen at 375x812', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    const help = trigger(page);
    await expect(help).toHaveAccessibleName('Help: Disorderly Conduct Offenses');
    await expect(help).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(help).toBeInViewport({ ratio: 1 });
    // Neither answer is pushed off screen by the help text.
    for (const index of [0, 1]) {
      await expect(answerButtons(page).nth(index)).toBeInViewport({ ratio: 1 });
    }
    // Everything is behind the button: no help text is on the page while closed.
    await expect(page.getByText('The following is a list of criminal offenses')).toBeHidden();
  });

  test('the trigger and the close controls are at least 44px', async ({ page }) => {
    await gotoNode(page, '11-11');
    const triggerBox = await trigger(page).boundingBox();
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    await openByClick(page);
    for (const name of ['Close', 'Back to the question']) {
      const box = await dialog(page).getByRole('button', { name }).boundingBox();
      expect(box?.height, name).toBeGreaterThanOrEqual(44);
      expect(box?.width, name).toBeGreaterThanOrEqual(44);
    }
  });

  test('opens with click, Enter and Space, and focus lands on the dialog heading', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    const help = trigger(page);

    await help.click();
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).getByRole('heading', { level: 2 })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();

    for (const key of ['Enter', 'Space']) {
      await help.focus();
      await page.keyboard.press(key);
      await expect(dialog(page), key).toBeVisible();
      await expect(dialog(page).getByRole('heading', { level: 2 }), key).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
    }
  });

  test('the dialog is named by its heading', async ({ page }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    await expect(dialog(page)).toHaveAccessibleName('Disorderly Conduct Offenses');
    await expect(dialog(page).getByRole('heading', { level: 2 })).toHaveText(
      'Disorderly Conduct Offenses',
    );
  });

  test('a node without help renders no Help button and no dialog', async ({ page }) => {
    expect(nodeHasHelp('2-6')).toBe(false);
    await gotoNode(page, '2-6');
    await expect(answerButtons(page).first()).toBeVisible();
    await expect(trigger(page)).toHaveCount(0);
    await expect(page.locator('dialog')).toHaveCount(0);
  });
});

test.describe('Help dialog: closing and focus', () => {
  test.use({ viewport: DESKTOP });

  const closers: Array<[string, (page: Page) => Promise<void>]> = [
    ['Esc', (page) => page.keyboard.press('Escape')],
    ['the Close button', (page) => dialog(page).getByRole('button', { name: 'Close' }).click()],
    [
      'Back to the question',
      (page) => dialog(page).getByRole('button', { name: 'Back to the question' }).click(),
    ],
    // A click on the backdrop, far from the centred dialog.
    ['a backdrop click', (page) => page.mouse.click(8, 8)],
  ];

  for (const [name, close] of closers) {
    test(`closes with ${name} and returns focus to the Help button`, async ({ page }) => {
      await gotoNode(page, '11-11');
      // A pointer open is the case WebKit does not restore focus for on its own.
      await openByClick(page);
      await close(page);
      await expect(dialog(page)).toBeHidden();
      await expect(trigger(page)).toBeFocused();
    });
  }

  test('a drag that starts inside the dialog and ends on the backdrop does not close it', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    const heading = await dialog(page).getByRole('heading', { level: 2 }).boundingBox();
    if (!heading) throw new Error('heading has no box');
    await page.mouse.move(heading.x + 4, heading.y + 4);
    await page.mouse.down();
    await page.mouse.move(8, 8, { steps: 5 });
    await page.mouse.up();
    await expect(dialog(page)).toBeVisible();
  });

  test('the answer buttons cannot be reached by keyboard while it is open', async ({ page }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const onAnswer = await page.evaluate(
        () => document.activeElement?.matches('button[aria-pressed]') ?? false,
      );
      expect(onAnswer, `Tab ${i + 1}`).toBe(false);
    }
    // The page behind is inert: a click on an answer is intercepted by the dialog layer.
    await expect(answerButtons(page).first().click({ trial: true, timeout: 1500 })).rejects.toThrow(
      /intercepts pointer events|not visible|outside of the viewport/,
    );
  });

  test('prefers-reduced-motion removes the dialog transition', async ({ page }) => {
    await gotoNode(page, '11-11');
    const durationOf = () => dialog(page).evaluate((el) => getComputedStyle(el).transitionDuration);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openByClick(page);
    expect(await durationOf()).not.toMatch(/^0s(, 0s)*$/);
    await page.keyboard.press('Escape');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openByClick(page);
    expect(await durationOf()).toMatch(/^0s(, 0s)*$/);
  });

  test('the dialog and its buttons keep a border so forced-colors mode can draw their edges', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await gotoNode(page, '11-11');
    await openByClick(page);
    const borders = async (locator: Locator) =>
      locator.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.borderTopStyle, s.borderTopWidth];
      });
    expect(await borders(dialog(page))).toEqual(['solid', '1px']);
    expect(await borders(dialog(page).getByRole('button', { name: 'Close' }))).toEqual([
      'solid',
      '1px',
    ]);
    expect(
      await borders(dialog(page).getByRole('button', { name: 'Back to the question' })),
    ).toEqual(['solid', '1px']);
  });
});

test.describe('Help dialog: page scroll and fit', () => {
  test('the page does not scroll while the dialog is open or after it closes', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoNode(page, '7-10');
    await page.evaluate(() => window.scrollTo(0, 120));
    await trigger(page).scrollIntoViewIfNeeded();
    const before = await scrollY(page);
    expect(before).toBeGreaterThan(0);

    await openByClick(page);
    expect(await scrollY(page)).toBe(before);
    await expect(page.locator('html')).toHaveCSS('overflow', 'hidden');

    // Scroll inside the sheet and over the backdrop: the page behind must not move.
    const body = dialog(page).locator('div[tabindex="0"]');
    await body.evaluate((el) => {
      el.scrollTop = 300;
    });
    await page.mouse.move(180, 60);
    await page.mouse.wheel(0, 400);
    await body.hover();
    await page.mouse.wheel(0, 400);
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await scrollY(page)).toBe(before);

    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    expect(await scrollY(page)).toBe(before);
  });

  for (const [name, viewport] of [
    ['375x812', MOBILE],
    ['667x375', LANDSCAPE_PHONE],
  ] as const) {
    test(`the longest help fits ${name} and scrolls inside the dialog`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await gotoNode(page, '7-10');
      const d = await openByClick(page);
      const box = await d.boundingBox();
      if (!box) throw new Error('dialog has no box');
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

      const body = d.locator('div[tabindex="0"]');
      const [scrollHeight, clientHeight] = await body.evaluate((el) => [
        el.scrollHeight,
        el.clientHeight,
      ]);
      expect(scrollHeight).toBeGreaterThan(clientHeight);
      // The dialog itself never scrolls, and nothing overflows it sideways.
      expect(await d.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
      expect(await d.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

      await expect(d.getByRole('button', { name: 'Close' })).toBeInViewport({ ratio: 1 });
      if (viewport.height > 480) {
        await expect(d.getByRole('button', { name: 'Back to the question' })).toBeInViewport({
          ratio: 1,
        });
      }
    });
  }
});

test.describe('Help content', () => {
  test('7-10 lists the counties in 2 columns at 375px and 4 at 1280px', async ({ page }) => {
    const columnCount = (d: Locator) =>
      d.locator('li').evaluateAll((items) => {
        // Entries that flow into one CSS column share a left edge.
        const lefts = new Set(items.map((li) => Math.round(li.getBoundingClientRect().left)));
        return lefts.size;
      });

    await page.setViewportSize(MOBILE);
    await gotoNode(page, '7-10');
    let d = await openByClick(page);
    await expect(d.getByRole('listitem')).toHaveCount(84);
    expect(await columnCount(d.locator('ul').first())).toBe(2);
    await page.keyboard.press('Escape');

    await page.setViewportSize(DESKTOP);
    d = await openByClick(page);
    expect(await columnCount(d.locator('ul').first())).toBe(4);
  });

  test('4-11 shows a single numbered list', async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await gotoNode(page, '4-11');
    const d = await openByClick(page);
    await expect(d.locator('ol')).toHaveCount(1);
    const items = await d.locator('ol > li').allInnerTexts();
    expect(items.length).toBeGreaterThan(5);
    // The numbers come from the list, not from text typed into the items.
    for (const item of items) expect(item).not.toMatch(/^\s*\d+\.\s/);
  });

  test('7-14 shows the statute with its (a) and (1) labels and no left border', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await gotoNode(page, '7-14');
    const d = await openByClick(page);
    for (const label of ['(a)', '(1)', '(2)', '(3)']) {
      await expect(d.getByText(label, { exact: true })).toBeVisible();
    }
    const leftBorders = await d
      .locator('ul, li')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).borderLeftWidth));
    expect(leftBorders.length).toBeGreaterThan(0);
    expect(new Set(leftBorders)).toEqual(new Set(['0px']));
    await expect(d.locator('blockquote')).toHaveCount(0);
  });

  test('12-3 has no "How to answer" box and its rule is plain bold text inside the dialog', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await gotoNode(page, '12-3');
    await expect(answerBox(page)).toHaveCount(0);
    const d = await openByClick(page);
    const rule = d.locator('b, strong').filter({ hasText: /answer (yes|no)/i });
    await expect(rule).toHaveCount(1);
    await expect(d.getByText('How to answer', { exact: true })).toHaveCount(0);
  });
});

// The reviewed-rule ledger decides which rules are promoted into the "How to answer" box. The
// expectations come from the committed ledger file, so adding an entry adds a positive test and
// the negative checks keep covering everything that has not been reviewed. A ledger approval also
// covers any node with identical wording (the review sheet lists them); if an entry is added for
// such a node, remove the twin from this list.
const UNREVIEWED_CANDIDATES = ['0-0', '2-0', '2-3', '4-11', '7-10', '7-14', '12-3', '14-5', '16-1'];

test.describe('"How to answer" box', () => {
  test.use({ viewport: MOBILE });

  test('the committed ledger is a version 1 ledger', () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    expect(ledger.version).toBe(1);
    expect(typeof ledger.entries).toBe('object');
  });

  for (const id of reviewedNodeIds) {
    test(`texas:${id} is in the ledger, so its rule shows in the box above the Help button`, async ({
      page,
    }) => {
      await gotoNode(page, id);
      const box = answerBox(page);
      await expect(box).toBeVisible();
      // Order in the card: question, box, Help button, answers.
      const boxY = (await box.boundingBox())?.y ?? Number.NaN;
      const helpY = (await trigger(page).boundingBox())?.y ?? Number.NaN;
      const answerY = (await answerButtons(page).first().boundingBox())?.y ?? Number.NaN;
      expect(boxY).toBeLessThan(helpY);
      expect(helpY).toBeLessThan(answerY);

      // The sentence is not repeated as a bold paragraph inside the dialog.
      const sentence = await box.locator('xpath=following-sibling::p').first().innerText();
      const d = await openByClick(page);
      await expect(d.getByText(sentence, { exact: true })).toHaveCount(0);
    });
  }

  for (const id of UNREVIEWED_CANDIDATES.filter((n) => !reviewedNodeIds.includes(n))) {
    test(`texas:${id} is not in the ledger, so it shows no box`, async ({ page }) => {
      await gotoNode(page, id);
      await expect(answerBox(page)).toHaveCount(0);
    });
  }
});
