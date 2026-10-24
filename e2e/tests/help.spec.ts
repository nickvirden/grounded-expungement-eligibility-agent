import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { decideHelp } from '../../apps/web/src/lib/helpRuleLedger';
import { expect, test } from '../cspGuard';
import { gotoNode, nodeHasHelp, reachableNodesWithHelp } from '../helpTree';

/**
 * Help dialog and "How to answer" box, driven through the real Quick Form.
 *
 * Nodes are reached by clicking the real answer buttons along a path computed from the
 * committed tree (see helpTree.ts). Node ids used below: 0-0 (short title, no rule), 11-11
 * (a rule in the first paragraph), 10-7 (the same, not yet reviewed), 2-6 (no help), 7-10 (84
 * counties), 4-11 (a numbered list) and 7-14 (a quoted statute).
 */

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1280, height: 800 };
const LANDSCAPE_PHONE = { width: 667, height: 375 };

const LEDGER_PATH = join(__dirname, '../../apps/web/src/lib/helpRuleLedger.json');

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
    // The `open` attribute, not visibility: a closing dialog stays visible while its exit
    // transition runs, which would let a wrongly closed dialog pass a visibility check.
    await page.waitForTimeout(400);
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
  });

  test('a press and release that both land on the backdrop closes it', async ({ page }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    await page.mouse.click(8, 8);
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
  });

  test('a click on the dialog edge or inside it does not close it', async ({ page }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    const box = await dialog(page).boundingBox();
    if (!box) throw new Error('dialog has no box');
    // The transparent border and the content are part of the dialog, not the backdrop.
    await page.mouse.click(box.x + 0.5, box.y + box.height / 2);
    await page.mouse.click(box.x + box.width / 2, box.y + 60);
    await page.waitForTimeout(400);
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
  });

  test('a click on the rounded-corner cutout, which hit-tests to the dialog, does not close it', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    const box = await dialog(page).boundingBox();
    if (!box) throw new Error('dialog has no box');
    // Inside the dialog's rectangle but outside its rounded shape: the event target is the
    // dialog, so only the bounding-box check keeps this click from being read as a backdrop click.
    await page.mouse.click(box.x + 1.5, box.y + 1.5);
    await page.waitForTimeout(400);
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
  });

  test('closing returns focus to the Help button even when the browser has nothing to restore', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    // A synthetic click opens the dialog without pointer events, so the browser records no
    // previously focused element; this is the situation WebKit is in after a tap or click.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await trigger(page).dispatchEvent('click');
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await expect(trigger(page)).toBeFocused();
  });

  test('the dialog frame is not a scroll container and never takes keyboard focus', async ({
    page,
  }) => {
    await gotoNode(page, '7-10');
    await openByClick(page);
    await expect(dialog(page)).toHaveCSS('overflow', 'hidden');
    // Outside the Tab order; it can only be focused programmatically.
    await expect(dialog(page)).toHaveAttribute('tabindex', '-1');
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      expect(tag, key).not.toBe('DIALOG');
    }
  });

  test('the dialog frame shows a visible inset ring when it takes focus from the keyboard', async ({
    page,
  }) => {
    await gotoNode(page, '11-11');
    await openByClick(page);
    // Engines that wrap Tab onto the frame do so after a keypress, which is what makes the
    // focus ring apply; the same state is reached here by focusing it after a key.
    await page.keyboard.press('Shift');
    await dialog(page).evaluate((el) => (el as HTMLElement).focus());
    const ring = await dialog(page).evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        focused: document.activeElement === el,
        style: s.outlineStyle,
        width: s.outlineWidth,
        offset: s.outlineOffset,
      };
    });
    expect(ring).toEqual({ focused: true, style: 'solid', width: '2px', offset: '-2px' });
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
      const back = d.getByRole('button', { name: 'Back to the question' });
      if (viewport.height > 480) {
        await expect(back).toBeInViewport({ ratio: 1 });
      } else {
        // Short viewports (landscape phones, 200% and 400% zoom) give the height to the body;
        // Close and Esc still dismiss.
        await expect(back).toBeHidden();
      }
    });
  }
});

test.describe('Help dialog: touch and in-flight requests', () => {
  test.use({ viewport: MOBILE, hasTouch: true });

  // A tap on the dimmed backdrop must only dismiss the sheet. If the dialog left the top layer
  // before the tap's click was dispatched, the click would land on whatever sits behind it.
  test('a tap on the backdrop over an answer closes the dialog and activates nothing behind it', async ({
    page,
  }) => {
    const assessRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/eligibility/assess')) {
        assessRequests.push(request.url());
      }
    });
    await gotoNode(page, '5-8');
    const questionBefore = await page.getByRole('heading', { level: 2 }).textContent();
    assessRequests.length = 0;

    await page.locator('button[aria-pressed]').first().scrollIntoViewIfNeeded();
    await trigger(page).tap();
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    const point = await page.evaluate(() => {
      const sheet = document.querySelector('dialog')?.getBoundingClientRect();
      const answer = document.querySelector('button[aria-pressed]')?.getBoundingClientRect();
      if (!sheet || !answer) return null;
      return {
        x: answer.left + answer.width / 2,
        y: answer.top + answer.height / 2,
        sheetTop: sheet.top,
      };
    });
    if (!point) throw new Error('missing dialog or answer');
    // The point must be on the backdrop, over an answer button, for the test to mean anything.
    expect(point.y).toBeLessThan(point.sheetTop - 2);
    expect(point.y).toBeGreaterThan(0);

    await page.touchscreen.tap(point.x, point.y);
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.waitForTimeout(800);
    expect(assessRequests).toEqual([]);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText(questionBefore ?? '');
  });

  test('a tap on the backdrop over the Back link closes the dialog and stays on the form', async ({
    page,
  }) => {
    await gotoNode(page, '5-8');
    await trigger(page).tap();
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    const link = await page.getByRole('link', { name: 'Back to home' }).boundingBox();
    if (!link) throw new Error('no Back link');
    await page.touchscreen.tap(link.x + link.width / 2, link.y + link.height / 2);
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.waitForTimeout(800);
    expect(new URL(page.url()).pathname).toBe('/intake/texas/quick');
  });

  test('the Help button is disabled while an answer is being submitted', async ({ page }) => {
    await gotoNode(page, '11-11');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/eligibility/assess', async (route) => {
      await gate;
      await route.continue();
    });
    await page.locator('button[aria-pressed]').first().click();
    await expect(page.getByLabel('Loading next question')).toBeVisible();
    await expect(trigger(page)).toBeDisabled();
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    release();
  });
});

// The second click of a double click or double tap would reach the page under the dialog once
// the first click has closed it. Each pointer-initiated close must swallow it, however slowly the
// user double-clicks, without delaying keyboard or assistive-technology activation.
test.describe('Help dialog: double activation does not reach the page behind', () => {
  test.use({ viewport: MOBILE, hasTouch: true });

  type Target = 'backdrop' | 'Close' | 'Back';
  const targets: Target[] = ['backdrop', 'Close', 'Back'];

  async function watchAssess(page: Page) {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/eligibility/assess')) {
        requests.push(request.url());
      }
    });
    await gotoNode(page, '5-8');
    requests.length = 0;
    return requests;
  }

  // The question heading, by its explicit role attribute: a closing dialog stays exposed for the
  // length of its exit transition, so a role query for level-2 headings can match two elements.
  const questionHeading = (page: Page) => page.locator('h2[role="heading"]');
  const questionText = async (page: Page) => (await questionHeading(page).textContent()) ?? '';

  async function openByTap(page: Page) {
    await trigger(page).tap();
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    await page
      .locator('dialog')
      .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  }

  /**
   * Waits until a close has fully settled: the dialog is closed, its `close` event has run and
   * focus is on the Help button. The browser restores focus natively before the `close` event
   * fires, and the event handler then focuses the button again, so focusing something else in
   * between would lose that second focus call.
   */
  async function settleAfterClose(page: Page) {
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    await expect(trigger(page)).toBeFocused();
  }

  /**
   * Sizes the viewport so the open dialog's `control` sits over the centre of the answer button at
   * `answerIndex`, and returns that point. The sheet is anchored to the bottom edge, so a
   * control's distance from the bottom is fixed and the viewport height moves it.
   */
  async function alignControlOverAnswer(page: Page, control: Locator, answerIndex: number) {
    const box = await control.boundingBox();
    const height = page.viewportSize()?.height ?? 0;
    if (!box) throw new Error('control has no box');
    const offset = height - (box.y + box.height / 2);
    const answers = await page.locator('button[aria-pressed]').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
      }),
    );
    const target = answers[answerIndex];
    if (!target) throw new Error(`no answer ${answerIndex}`);
    // The footer is hidden at heights of 480px and below, so the viewport must stay above that.
    await page.setViewportSize({
      width: MOBILE.width,
      height: Math.round((target.top + target.bottom) / 2 + offset),
    });
    // Let the resize reflow before measuring, so the point is not read from the old layout.
    await page.waitForTimeout(400);
    const after = await control.boundingBox();
    const answerBox = await page.locator('button[aria-pressed]').nth(answerIndex).boundingBox();
    if (!after || !answerBox) throw new Error('missing boxes after resize');
    const point = { x: after.x + after.width / 2, y: after.y + after.height / 2 };
    // The point must be over an answer for the test to mean anything.
    expect(point.y).toBeGreaterThan(answerBox.y);
    expect(point.y).toBeLessThan(answerBox.y + answerBox.height);
    return point;
  }

  /** Opens the dialog and returns the point of the target, which lies over an answer button. */
  async function openAndFindPoint(page: Page, target: Target) {
    await openByTap(page);
    if (target === 'backdrop') {
      const point = await page.evaluate(() => {
        const answer = document.querySelector('button[aria-pressed]')?.getBoundingClientRect();
        return answer
          ? { x: answer.left + answer.width / 2, y: answer.top + answer.height / 2 }
          : null;
      });
      if (!point) throw new Error('no answer');
      return point;
    }
    const control =
      target === 'Close'
        ? dialog(page).getByRole('button', { name: 'Close' })
        : dialog(page).getByRole('button', { name: 'Back to the question' });
    return alignControlOverAnswer(page, control, target === 'Close' ? 0 : 1);
  }

  async function expectNothingActivated(page: Page, requests: string[], questionBefore: string) {
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.waitForTimeout(800);
    expect(requests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe('/intake/texas/quick');
    await expect(questionHeading(page)).toHaveText(questionBefore);
    // The swallowed press must not move focus onto the control under the pointer either.
    await expect(trigger(page)).toBeFocused();
  }

  type Sequence = { kind: 'mouse' | 'tap'; gaps: number[] };
  async function press(page: Page, sequence: Sequence, point: { x: number; y: number }) {
    for (const [index, gap] of [0, ...sequence.gaps].entries()) {
      if (index > 0) await page.waitForTimeout(gap);
      if (sequence.kind === 'tap') {
        await page.touchscreen.tap(point.x, point.y);
      } else {
        // The first click closes the dialog; later ones report the running click count, as a
        // real double click does. Playwright's own `clickCount` option on `mouse.click` sends
        // every count in one call, including a plain click at the later time, so the press and
        // release are sent separately.
        await page.mouse.move(point.x, point.y);
        await page.mouse.down({ clickCount: index + 1 });
        await page.mouse.up({ clickCount: index + 1 });
      }
    }
  }

  const sequences: Array<[string, Sequence]> = [
    ['a double click', { kind: 'mouse', gaps: [30] }],
    ['a double tap', { kind: 'tap', gaps: [60] }],
    ...[150, 300, 380, 420, 500, 600, 900].map((gap): [string, Sequence] => [
      `a double click ${gap}ms apart`,
      { kind: 'mouse', gaps: [gap] },
    ]),
    ...[420, 500, 600].map((gap): [string, Sequence] => [
      `a double tap ${gap}ms apart`,
      { kind: 'tap', gaps: [gap] },
    ]),
    ['a triple tap 200ms apart', { kind: 'tap', gaps: [200, 200] }],
  ];

  for (const target of targets) {
    for (const [name, sequence] of sequences) {
      test(`${name} on ${target} over an answer activates nothing behind it`, async ({ page }) => {
        const requests = await watchAssess(page);
        const before = await questionText(page);
        const point = await openAndFindPoint(page, target);
        await press(page, sequence, point);
        await expectNothingActivated(page, requests, before);
      });
    }
  }

  test('a press that begins inside the window and is released after it does not reach the page', async ({
    page,
  }) => {
    const requests = await watchAssess(page);
    const before = await questionText(page);
    const point = await openAndFindPoint(page, 'backdrop');
    await page.mouse.click(point.x, point.y);
    // Pressed 550ms after the close (inside the 700ms window) and released about 200ms later,
    // outside it: the click that results belongs to a press the guard already cancelled.
    await page.waitForTimeout(550);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expectNothingActivated(page, requests, before);
  });

  test('a deliberate tap on an answer 900ms after closing works normally', async ({ page }) => {
    const requests = await watchAssess(page);
    await openByTap(page);
    await dialog(page).getByRole('button', { name: 'Back to the question' }).tap();
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.waitForTimeout(900);
    await page.locator('button[aria-pressed]').first().tap();
    await expect.poll(() => requests.length).toBe(1);
  });

  test('keyboard activation of an answer works right after closing with Esc', async ({ page }) => {
    const requests = await watchAssess(page);
    await openByTap(page);
    await page.keyboard.press('Escape');
    await settleAfterClose(page);
    await page.locator('button[aria-pressed]').first().focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => requests.length).toBe(1);
  });

  test('keyboard activation of an answer is not delayed right after a pointer close', async ({
    page,
  }) => {
    const requests = await watchAssess(page);
    await openByTap(page);
    await dialog(page).getByRole('button', { name: 'Back to the question' }).tap();
    await settleAfterClose(page);
    await page.locator('button[aria-pressed]').first().focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => requests.length).toBe(1);
  });

  test('the Help button reopens by keyboard right after a pointer close', async ({ page }) => {
    await watchAssess(page);
    await openByTap(page);
    await dialog(page).getByRole('button', { name: 'Back to the question' }).tap();
    await settleAfterClose(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
  });

  test('opening the dialog again ends the window, so a tap after a keyboard close works', async ({
    page,
  }) => {
    const requests = await watchAssess(page);
    await openByTap(page);
    await dialog(page).getByRole('button', { name: 'Back to the question' }).tap();
    await settleAfterClose(page);
    await page.keyboard.press('Enter');
    await expect(page.locator('dialog')).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog')).not.toHaveAttribute('open', '');
    await page.locator('button[aria-pressed]').first().tap();
    await expect.poll(() => requests.length).toBe(1);
  });

  test('the window ends when the question changes, so a tap on the next question works', async ({
    page,
  }) => {
    const requests = await watchAssess(page);
    const before = await questionText(page);
    await openByTap(page);
    await dialog(page).getByRole('button', { name: 'Back to the question' }).tap();
    await settleAfterClose(page);
    // Answer by keyboard (not delayed); the next question replaces the card and its dialog.
    await page.locator('button[aria-pressed]').first().focus();
    await page.keyboard.press('Enter');
    await expect(questionHeading(page)).not.toHaveText(before);
    await page.locator('button[aria-pressed]:enabled').first().tap();
    await expect.poll(() => requests.length).toBe(2);
  });
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

  test('10-7 has no "How to answer" box and its rule is plain bold text inside the dialog', async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await gotoNode(page, '10-7');
    await expect(answerBox(page)).toHaveCount(0);
    const d = await openByClick(page);
    const rule = d.locator('b, strong').filter({ hasText: /answer (yes|no)/i });
    await expect(rule).toHaveCount(1);
    await expect(d.getByText('How to answer', { exact: true })).toHaveCount(0);
  });
});

// The reviewed-rule ledger decides which rules are promoted into the "How to answer" box. The
// expected result for every node with help is computed with the same library the page uses and
// the committed ledger, so approving a node (and any node with identical wording, which the
// review sheet lists) is covered without editing this file.
const withHelp = reachableNodesWithHelp().map(({ id, node }) => ({
  id,
  decision: decideHelp({
    state: 'texas',
    question: node.question,
    help: node.help ?? '',
    answers: node.answers,
  }),
}));

test.describe('"How to answer" box', () => {
  test.use({ viewport: MOBILE });

  test('the committed ledger is a version 1 ledger', () => {
    const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    expect(ledger.version).toBe(1);
    expect(typeof ledger.entries).toBe('object');
  });

  test('every tree node with help is covered by the data-driven box checks', () => {
    expect(withHelp.length).toBeGreaterThan(20);
  });

  for (const { id, decision } of withHelp) {
    test(`texas:${id} shows the box ${decision.promoted ? 'because it is reviewed' : 'only when reviewed (it is not)'}`, async ({
      page,
    }) => {
      await gotoNode(page, id);
      const box = answerBox(page);
      if (!decision.promoted) {
        await expect(box).toHaveCount(0);
        return;
      }
      await expect(box).toBeVisible();
      // Order in the card: question, box, Help button, answers.
      const boxY = (await box.boundingBox())?.y ?? Number.NaN;
      const helpY = (await trigger(page).boundingBox())?.y ?? Number.NaN;
      const answerY = (await answerButtons(page).first().boundingBox())?.y ?? Number.NaN;
      expect(boxY).toBeLessThan(helpY);
      expect(helpY).toBeLessThan(answerY);
      await expect(box.locator('xpath=following-sibling::p').first()).toHaveText(
        decision.content.directive ?? '',
      );
      // The sentence is not repeated as a bold paragraph inside the dialog.
      const d = await openByClick(page);
      await expect(d.getByText(decision.content.directive ?? '', { exact: true })).toHaveCount(0);
    });
  }

  // Controls that must never show a box, whatever the ledger holds. 0-0 and 2-3 have no single
  // rule sentence in a promotable position, so no entry can promote them.
  for (const id of ['0-0', '2-3']) {
    test(`texas:${id} cannot be promoted by any ledger entry`, async ({ page }) => {
      const reason = withHelp.find((n) => n.id === id)?.decision.reason;
      expect(['no-rule', 'more-than-one-rule', 'rule-not-in-first-paragraph']).toContain(reason);
      await gotoNode(page, id);
      await expect(answerBox(page)).toHaveCount(0);
    });
  }
});
