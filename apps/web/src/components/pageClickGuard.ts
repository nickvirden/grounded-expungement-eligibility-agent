/**
 * How long after a pointer-initiated close every pointer click outside the dialog is swallowed.
 * It covers the platform's default double-click time (500ms on Windows) plus margin, and a
 * triple tap at a normal pace. Cost: a deliberate tap on an answer within this long of closing
 * the dialog with the pointer is ignored.
 */
export const POINTER_WINDOW_MS = 700;

/**
 * How long a click that continues a multi-click sequence (`detail` of 2 or more) is swallowed.
 * It covers the slowest double-click time a user can configure on Windows or macOS. A tap on its
 * own reports `detail` 1, so a deliberate single tap is never held back past the window above.
 */
export const MULTI_CLICK_WINDOW_MS = 1200;

/**
 * Whether a click or mousedown at `elapsedMs` after a pointer close must be kept from the page.
 * Activations with `detail` 0 are keyboard, assistive-technology or programmatic clicks; they
 * cannot be the second half of a pointer double-activation, so they always pass.
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
 * Cancelling `mousedown` also stops focus from moving to the element under the pointer. Only one
 * window runs at a time, and its listeners never stack.
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
    const swallow = (event: Event) => {
      const target = event.target as Node | null;
      const pointerEvent = event as MouseEvent;
      if (
        shouldSwallow({
          insideDialog: target !== null && inside.contains(target),
          detail: pointerEvent.detail,
          elapsedMs: env.now() - startedAt,
        })
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    for (const type of events) env.document.addEventListener(type, swallow, true);
    const timer = env.setTimeout(end, MULTI_CLICK_WINDOW_MS);
    release = () => {
      env.clearTimeout(timer);
      for (const type of events) env.document.removeEventListener(type, swallow, true);
    };
  };

  return { start, end };
}
