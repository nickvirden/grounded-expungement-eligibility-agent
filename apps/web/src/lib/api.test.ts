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
  const tree = { entryNodeId: 'q0', nodes: {}, transitions: [] };
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

  it('encodes a slash so the request cannot leave the states path', async () => {
    const urls = recordUrls(entry);
    await getStateEntry('../healthz');
    await getStateEntry('a/b');
    assert.equal(urls.length, 2);
    for (const u of urls) {
      const { pathname } = new URL(u);
      assert.match(pathname, /^\/api\/states\/[^/]+\/entry$/);
    }
    assert.equal(new URL(urls[0] as string).pathname, '/api/states/..%2Fhealthz/entry');
  });

  it('keeps query and fragment characters out of the URL structure', async () => {
    const urls = recordUrls(tree);
    await getStateTree('a?x=1#frag');
    const url = new URL(urls[0] as string);
    assert.equal(url.search, '');
    assert.equal(url.hash, '');
    assert.equal(url.pathname, '/api/states/a%3Fx%3D1%23frag/tree');
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
    await assert.rejects(
      () => getStateEntry('texas', { signal: AbortSignal.timeout(20) }),
      (err) => err instanceof Error && err.name === 'TimeoutError',
    );
  });
});
