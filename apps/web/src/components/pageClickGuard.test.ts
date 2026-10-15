import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  type ClickGuardEnv,
  MULTI_CLICK_WINDOW_MS,
  POINTER_WINDOW_MS,
  createClickGuard,
  shouldSwallow,
} from './pageClickGuard';

describe('shouldSwallow', () => {
  const at = (elapsedMs: number, detail = 1, insideDialog = false) =>
    shouldSwallow({ insideDialog, detail, elapsedMs });

  it('swallows a pointer click outside the dialog during the pointer window', () => {
    assert.equal(at(0), true);
    assert.equal(at(POINTER_WINDOW_MS - 1), true);
  });

  it('lets a single click through once the pointer window ends', () => {
    assert.equal(at(POINTER_WINDOW_MS), false);
    assert.equal(at(MULTI_CLICK_WINDOW_MS - 1), false);
  });

  it('keeps swallowing the continuation of a multi-click sequence until the longer window ends', () => {
    assert.equal(at(POINTER_WINDOW_MS, 2), true);
    assert.equal(at(MULTI_CLICK_WINDOW_MS - 1, 3), true);
    assert.equal(at(MULTI_CLICK_WINDOW_MS, 2), false);
  });

  it('never swallows a click inside the dialog', () => {
    assert.equal(at(0, 1, true), false);
    assert.equal(at(0, 2, true), false);
  });

  it('never swallows keyboard, assistive-technology or programmatic clicks (detail 0)', () => {
    assert.equal(at(0, 0), false);
    assert.equal(at(POINTER_WINDOW_MS - 1, 0), false);
  });
});

describe('createClickGuard', () => {
  /** A fake clock, timer queue and document that records its listeners. */
  function fakeEnv() {
    let time = 0;
    const timers: Array<{ id: number; at: number; handler: () => void }> = [];
    let nextId = 1;
    const listeners = new Set<{ type: string; fn: (e: Event) => void }>();
    const env: ClickGuardEnv = {
      document: {
        addEventListener: (type: string, fn: EventListenerOrEventListenerObject) =>
          listeners.add({ type, fn: fn as (e: Event) => void }),
        removeEventListener: (type: string, fn: EventListenerOrEventListenerObject) => {
          for (const l of listeners) if (l.type === type && l.fn === fn) listeners.delete(l);
        },
      } as ClickGuardEnv['document'],
      now: () => time,
      setTimeout: (handler, ms) => {
        const timer = { id: nextId++, at: time + ms, handler };
        timers.push(timer);
        return timer.id;
      },
      clearTimeout: (id) => {
        const i = timers.findIndex((t) => t.id === id);
        if (i >= 0) timers.splice(i, 1);
      },
    };
    const advance = (ms: number) => {
      time += ms;
      for (const t of [...timers]) {
        if (t.at <= time) {
          timers.splice(timers.indexOf(t), 1);
          t.handler();
        }
      }
    };
    /** Dispatches to every listener of the type, like a capture listener on document. */
    const dispatch = (type: string, target: object, detail: number) => {
      const calls = { preventDefault: 0, stopPropagation: 0 };
      const event = {
        type,
        target,
        detail,
        preventDefault: () => {
          calls.preventDefault++;
        },
        stopPropagation: () => {
          calls.stopPropagation++;
        },
      };
      for (const l of [...listeners]) if (l.type === type) l.fn(event as unknown as Event);
      return calls;
    };
    return { env, advance, dispatch, listenerCount: () => listeners.size };
  }

  const inner = {};
  const outer = {};
  const dialog = { contains: (n: Node) => (n as unknown) === inner };

  it('cancels a pointer click outside the dialog, both default action and propagation', () => {
    const { env, dispatch } = fakeEnv();
    createClickGuard(env).start(dialog);
    assert.deepEqual(dispatch('click', outer, 1), { preventDefault: 1, stopPropagation: 1 });
  });

  it('cancels mousedown and dblclick outside the dialog too', () => {
    const { env, dispatch } = fakeEnv();
    createClickGuard(env).start(dialog);
    assert.equal(dispatch('mousedown', outer, 1).preventDefault, 1);
    assert.equal(dispatch('dblclick', outer, 2).preventDefault, 1);
  });

  it('leaves clicks inside the dialog alone', () => {
    const { env, dispatch } = fakeEnv();
    createClickGuard(env).start(dialog);
    assert.deepEqual(dispatch('click', inner, 1), { preventDefault: 0, stopPropagation: 0 });
  });

  it('leaves keyboard and programmatic clicks (detail 0) alone', () => {
    const { env, dispatch } = fakeEnv();
    createClickGuard(env).start(dialog);
    assert.deepEqual(dispatch('click', outer, 0), { preventDefault: 0, stopPropagation: 0 });
  });

  it('follows both windows on the injected clock', () => {
    const { env, advance, dispatch } = fakeEnv();
    createClickGuard(env).start(dialog);
    advance(POINTER_WINDOW_MS - 1);
    assert.equal(dispatch('click', outer, 1).preventDefault, 1);
    advance(1);
    assert.equal(dispatch('click', outer, 1).preventDefault, 0);
    assert.equal(dispatch('click', outer, 2).preventDefault, 1);
    advance(MULTI_CLICK_WINDOW_MS - POINTER_WINDOW_MS);
    assert.equal(dispatch('click', outer, 2).preventDefault, 0);
  });

  it('removes its listeners when the longer window ends', () => {
    const { env, advance, listenerCount } = fakeEnv();
    createClickGuard(env).start(dialog);
    assert.equal(listenerCount(), 3);
    advance(MULTI_CLICK_WINDOW_MS);
    assert.equal(listenerCount(), 0);
  });

  it('removes its listeners when ended early, and ending twice is harmless', () => {
    const { env, dispatch, listenerCount } = fakeEnv();
    const guard = createClickGuard(env);
    guard.start(dialog);
    guard.end();
    guard.end();
    assert.equal(listenerCount(), 0);
    assert.equal(dispatch('click', outer, 1).preventDefault, 0);
  });

  it('does not stack listeners when started twice, and restarts the window', () => {
    const { env, advance, dispatch, listenerCount } = fakeEnv();
    const guard = createClickGuard(env);
    guard.start(dialog);
    advance(600);
    guard.start(dialog);
    assert.equal(listenerCount(), 3);
    advance(600);
    // 1200ms after the first start but only 600ms after the second.
    assert.equal(dispatch('click', outer, 1).preventDefault, 1);
  });
});
