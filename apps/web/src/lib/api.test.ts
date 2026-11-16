import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ApiError, deleteIntake, getStateEntry, getStateTree } from './api.js';

describe('deleteIntake', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('resolves without throwing on a 204 No Content response', async () => {
    // DELETE /api/intakes/{id} returns 204 on success -- fetchJson must not
    // call res.json() on a body-less response, or a successful delete would
    // surface to the caller as a thrown SyntaxError.
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    await assert.doesNotReject(() => deleteIntake('some-id'));
  });
});

describe('getStateTree', () => {
  const originalFetch = globalThis.fetch;
  const tree = { entryNodeId: 'q0', nodes: {}, transitions: [] };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function captureUrl(): { url: () => string } {
    let seen = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen = String(input);
      return Response.json({ ...tree, treeVersion: 'abcdef012345', superseded: true });
    }) as typeof fetch;
    return { url: () => seen };
  }

  it('requests a well-formed version and parses the version fields', async () => {
    const cap = captureUrl();
    const result = await getStateTree('texas', undefined, 'abcdef012345');
    assert.ok(cap.url().endsWith('/api/states/texas/tree?version=abcdef012345'));
    assert.equal(result.treeVersion, 'abcdef012345');
    assert.equal(result.superseded, true);
  });

  it('never sends a malformed version', async () => {
    const cap = captureUrl();
    await getStateTree('texas', undefined, 'zzz&x=1');
    assert.ok(cap.url().endsWith('/api/states/texas/tree'));
  });

  it('parses a tree from an API that predates versioning', async () => {
    globalThis.fetch = (async () => Response.json(tree)) as typeof fetch;
    const result = await getStateTree('texas');
    assert.equal(result.treeVersion, undefined);
  });
});

describe('state slug in the API path', () => {
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
  });

  function recordUrls(body: unknown): string[] {
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return Response.json(body);
    }) as typeof fetch;
    return urls;
  }

  it('leaves a valid slug unchanged in either case', async () => {
    const urls = recordUrls(entry);
    await getStateEntry('texas');
    await getStateEntry('Texas');
    assert.deepEqual(
      urls.map((u) => new URL(u).pathname),
      ['/api/states/texas/entry', '/api/states/Texas/entry'],
    );
  });

  it('sends a slug with an underscore as is', async () => {
    const urls = recordUrls(entry);
    await getStateEntry('new_york');
    assert.equal(new URL(urls[0] as string).pathname, '/api/states/new_york/entry');
  });

  it('rejects a slug that is not state-shaped before any request', async () => {
    const urls = recordUrls(entry);
    for (const slug of ['..', '../healthz', 'a/b', '..%2Fhealthz', 'a?x=1#frag', '']) {
      for (const call of [() => getStateEntry(slug), () => getStateTree(slug)]) {
        await assert.rejects(call, (err) => err instanceof ApiError && err.status === 404, slug);
      }
    }
    assert.equal(urls.length, 0);
  });

  it('throws ApiError carrying the status for an unknown state', async () => {
    globalThis.fetch = (async () =>
      new Response('{"detail":"nope"}', { status: 404 })) as typeof fetch;
    await assert.rejects(
      () => getStateEntry('nowhere'),
      (err) => err instanceof ApiError && err.status === 404,
    );
  });

  it('rejects once the signal fires when the API never answers', async () => {
    // A fetch that honours its signal but never produces a response, like a hung API.
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as typeof fetch;
    // AbortSignal.timeout's timer is unref'd, so on its own nothing would keep the event
    // loop alive while the mock fetch is pending and node:test would cancel the test.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('t', 'TimeoutError')), 20);
    try {
      await assert.rejects(
        () => getStateEntry('texas', { signal: controller.signal }),
        (err) => err instanceof DOMException && err.name === 'TimeoutError',
      );
    } finally {
      clearTimeout(timer);
    }
  });
});
