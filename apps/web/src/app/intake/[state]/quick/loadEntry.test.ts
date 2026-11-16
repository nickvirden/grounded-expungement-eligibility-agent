import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { loadEntry } from './loadEntry.js';

describe('loadEntry', () => {
  const originalFetch = globalThis.fetch;
  const entry = {
    question_id: 1,
    question: 'Q?',
    help: null,
    answers: [{ value: 'Yes', position: 1 }],
    questions_left: 3,
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restoreAll();
  });

  function stubFetch(respond: () => Promise<Response>): RequestInit[] {
    const inits: RequestInit[] = [];
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      inits.push(init ?? {});
      return respond();
    }) as typeof fetch;
    return inits;
  }

  it('returns null without any request for a slug that is not state-shaped', async () => {
    const inits = stubFetch(async () => Response.json(entry));
    for (const slug of ['..', '..%2Fhealthz', 'a/b', 'a?x=1']) {
      assert.equal(await loadEntry(slug), null, slug);
    }
    assert.equal(inits.length, 0);
  });

  it('returns the entry for a valid slug, caching and timing out the request', async () => {
    const timeout = mock.method(AbortSignal, 'timeout');
    const inits = stubFetch(async () => Response.json(entry));
    assert.deepEqual(await loadEntry('new_york'), entry);
    assert.equal(inits.length, 1);
    assert.ok(inits[0]?.signal instanceof AbortSignal);
    assert.deepEqual(
      timeout.mock.calls.map((c) => c.arguments[0]),
      [5_000],
    );
    assert.deepEqual((inits[0] as { next?: unknown }).next, { revalidate: 3600 });
  });

  it('rejects when the timeout signal fires on a request the API never answers', async () => {
    // AbortSignal.timeout runs on a timer mock timers cannot drive, so the signal is
    // swapped for one the test fires itself; the 5000 ms duration is asserted above.
    const controller = new AbortController();
    mock.method(AbortSignal, 'timeout', () => controller.signal);
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    const pending = loadEntry('texas');
    controller.abort(new DOMException('timed out', 'TimeoutError'));
    await assert.rejects(
      pending,
      (err) => err instanceof DOMException && err.name === 'TimeoutError',
    );
  });

  it('maps a 404 to null', async () => {
    stubFetch(async () => new Response('{"detail":"nope"}', { status: 404 }));
    assert.equal(await loadEntry('nowhere'), null);
  });

  it('propagates a server error instead of reporting a missing page', async () => {
    stubFetch(async () => new Response('boom', { status: 500 }));
    await assert.rejects(() => loadEntry('texas'), /API 500/);
  });

  it('propagates a transport failure', async () => {
    stubFetch(async () => {
      throw new TypeError('fetch failed');
    });
    await assert.rejects(() => loadEntry('texas'), TypeError);
  });
});
