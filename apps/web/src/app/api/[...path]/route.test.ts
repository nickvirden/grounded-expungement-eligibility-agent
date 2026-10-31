import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as route from './route.js';

const PROBE_PATH = '/api/probe-7f3a';
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

describe('unmatched /api route', () => {
  for (const method of METHODS) {
    it(`${method} answers 404 JSON that is not cached and does not echo the path`, async () => {
      // Next calls the handler with the request and its route params; passing
      // both makes the no-echo assertion able to fail for a handler that reads them.
      const handler = route[method] as (req: Request, ctx: unknown) => Response;
      const res = await handler(new Request(`https://example.com${PROBE_PATH}`, { method }), {
        params: Promise.resolve({ path: ['probe-7f3a'] }),
      });

      assert.equal(res.status, 404);
      assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
      assert.equal(res.headers.get('cache-control'), 'no-store');

      const text = await res.text();
      assert.deepEqual(JSON.parse(text), { detail: 'Not Found' });
      assert.ok(!text.includes(PROBE_PATH));
    });
  }

  it('does not export HEAD, which Next derives from GET', () => {
    assert.equal('HEAD' in route, false);
  });

  it('answers 404 rather than 403 to a POST from a foreign origin', async () => {
    const post = route.POST as (req: Request) => Response;
    const res = post(
      new Request(`https://example.com${PROBE_PATH}`, {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
    );

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { detail: 'Not Found' });
  });
});
