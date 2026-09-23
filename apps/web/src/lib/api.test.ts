import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { deleteIntake } from './api.js';

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
