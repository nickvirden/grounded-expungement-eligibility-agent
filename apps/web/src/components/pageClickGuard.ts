/**
 * How long after a pointer-initiated close every pointer click outside the dialog is swallowed.
 * It covers the platform's default double-click time (500ms on Windows) plus margin. Cost: a
 * deliberate tap on an answer within this long of closing the dialog with the pointer is
 * ignored. WebKit and Firefox report `detail` 1 for every tap, so touch there is held back only
 * for this window; Chromium counts taps, so the longer window below also applies to touch.
 */
export const POINTER_WINDOW_MS = 700;

/**
 * How long a click that continues a multi-click sequence (`detail` of 2 or more) is swallowed.
 * It exceeds the longest double-click time of any platform setting we know of (Windows tops out
 * at 900ms), with margin. A click on its own reports `detail` 1, so a deliberate single click is
 * never held back past the window above.
 */
export const MULTI_CLICK_WINDOW_MS = 1200;

/**
 * Whether a click or mousedown at `elapsedMs` after a pointer close must be kept from the page.
 * Activations with `detail` 0 are keyboard or programmatic clicks; they cannot be the second
 * half of a pointer double-activation, so they always pass. An assistive-technology activation
 * that a platform synthesizes as a touch reports `detail` 1 and is treated as a pointer click.
 */
export function shouldSwallow(input: {
  insideDialog: boolean;
  detail: number;
  elapsedMs: number;
}): boolean {
  if (input.insideDialog || input.detail === 0) return false;
  if (input.elapsedMs < POINTER_WINDOW_MS) return true;
  return input.detail >= 2 && input.elapsedMs < MULTI_CLICK_WINDOW_MS;
}

/** How long listeners stay after the window ends when a cancelled press has not yet clicked. */
const STRADDLE_GRACE_MS = 1000;

/** The browser facilities the guard uses, injectable so the timing can be tested. */
export interface ClickGuardEnv {
  document: Pick<Document, 'addEventListener' | 'removeEventListener'>;
  now(): number;
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

// Touches `document` only when a guard starts, so importing this module during server rendering
// is safe.
const browserEnv: ClickGuardEnv = {
  get document() {
    return document;
  },
  now: () => performance.now(),
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface ClickGuard {
  /** Begins a window after a pointer-initiated close; replaces any window already running. */
  start(inside: { contains(target: Node): boolean }): void;
  /** Ends the window early. Safe to call when none is running. */
  end(): void;
}

/**
 * Keeps the second click of a double click or double tap from reaching the page under the dialog.
 *
 * A pointer close happens on the first click. Once the dialog has left the top layer, the next
 * click would be delivered to whatever sits beneath the pointer: an answer button (the form has
 * no undo) or the Back link. For the window after a pointer close, a capture-phase listener on
 * `document` cancels pointer `click`, `dblclick` and `mousedown` events aimed outside the dialog.
 * Cancelling `mousedown` also stops focus from moving to the element under the pointer.
 *
 * A press is judged once, at `mousedown`. If it began inside a window and was cancelled, its
 * `click` is cancelled too even when the button is released after the window ends; deciding the
 * two events separately would let that click through. A press that began after the window is never
 * affected. When a window ends while such a press is still held, the listeners stay until its
 * click (or the next press, or one more second) and then remove themselves, so the guard cannot
 * stay installed. Only one window runs at a time, and its listeners never stack.
 */
export function createClickGuard(env: ClickGuardEnv = browserEnv): ClickGuard {
  let release: (() => void) | null = null;
  const events = ['click', 'dblclick', 'mousedown'] as const;

  const end = () => {
    release?.();
    release = null;
  };

  const start: ClickGuard['start'] = (inside) => {
    end();
    const startedAt = env.now();
    // The decision made at the latest `mousedown`, applied to the `click` that follows it.
    let pressCancelled = false;
    // The decision made for the latest `click`, applied to a `dblclick` that follows it.
    let clickCancelled = false;
    let windowOver = false;

    const swallow = (event: Event) => {
      const target = event.target as Node | null;
      const { detail } = event as MouseEvent;
      const timed = shouldSwallow({
        insideDialog: target !== null && inside.contains(target),
        detail,
        elapsedMs: env.now() - startedAt,
      });
      let cancel = timed;
      if (event.type === 'mousedown') {
        pressCancelled = timed;
        // A new press that begins after the window ends a window held open for an old press.
        if (windowOver && !timed) {
          end();
          return;
        }
      } else if (event.type === 'click') {
        cancel = timed || (pressCancelled && detail > 0);
        pressCancelled = false;
        clickCancelled = cancel;
      } else {
        cancel = timed || clickCancelled;
      }
      if (cancel) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (windowOver && event.type === 'click') end();
    };

    for (const type of events) env.document.addEventListener(type, swallow, true);

    let timers: unknown[] = [];
    const windowTimer = env.setTimeout(() => {
      if (!pressCancelled) {
        end();
        return;
      }
      windowOver = true;
      timers.push(env.setTimeout(end, STRADDLE_GRACE_MS));
    }, MULTI_CLICK_WINDOW_MS);
    timers = [windowTimer];
    release = () => {
      for (const timer of timers) env.clearTimeout(timer);
      for (const type of events) env.document.removeEventListener(type, swallow, true);
    };
  };

  return { start, end };
}
