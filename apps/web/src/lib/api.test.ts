import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { deleteIntake, getStateTree } from './api.js';

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
