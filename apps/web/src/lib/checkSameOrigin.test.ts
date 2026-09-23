import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSameOriginRequest } from './checkSameOrigin.js';

function makeRequest(headers: Record<string, string>): Request {
  return new Request('https://example.com/api/backend/api/intakes', {
    method: 'POST',
    headers,
  });
}

describe('isSameOriginRequest', () => {
  it('accepts a request whose Origin matches Host', () => {
    const req = makeRequest({ origin: 'https://example.com', host: 'example.com' });
    assert.equal(isSameOriginRequest(req), true);
  });

  it('accepts a request whose Origin matches X-Forwarded-Host', () => {
    const req = makeRequest({
      origin: 'https://example.com',
      host: 'internal-service:3000',
      'x-forwarded-host': 'example.com',
    });
    assert.equal(isSameOriginRequest(req), true);
  });

  it('rejects a request from an unexpected origin', () => {
    const req = makeRequest({ origin: 'https://evil-attacker.example.com', host: 'example.com' });
    assert.equal(isSameOriginRequest(req), false);
  });

  it('rejects a request with no Origin header', () => {
    const req = makeRequest({ host: 'example.com' });
    assert.equal(isSameOriginRequest(req), false);
  });

  it('rejects a request with no Host header', () => {
    const req = makeRequest({ origin: 'https://example.com' });
    assert.equal(isSameOriginRequest(req), false);
  });

  it('rejects a malformed Origin header', () => {
    const req = makeRequest({ origin: 'not-a-valid-url', host: 'example.com' });
    assert.equal(isSameOriginRequest(req), false);
  });
});
