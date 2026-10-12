import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCsp } from './buildCsp.js';

function directive(policy: string, name: string): string | undefined {
  return policy.split('; ').find((d) => d.startsWith(`${name} `));
}

describe('buildCsp (production)', () => {
  const policy = buildCsp('abc123', false);

  it('authorises scripts by nonce with strict-dynamic and no inline or eval', () => {
    const script = directive(policy, 'script-src');
    assert.equal(script, "script-src 'self' 'nonce-abc123' 'strict-dynamic'");
  });

  it('authorises styles by nonce only', () => {
    assert.equal(directive(policy, 'style-src'), "style-src 'self' 'nonce-abc123'");
  });

  it('restricts connections, framing, objects, base and forms', () => {
    assert.equal(directive(policy, 'connect-src'), "connect-src 'self'");
    assert.equal(directive(policy, 'frame-ancestors'), "frame-ancestors 'none'");
    assert.equal(directive(policy, 'object-src'), "object-src 'none'");
    assert.equal(directive(policy, 'base-uri'), "base-uri 'self'");
    assert.equal(directive(policy, 'form-action'), "form-action 'self'");
  });

  it('upgrades insecure requests', () => {
    assert.ok(policy.split('; ').includes('upgrade-insecure-requests'));
  });

  it('embeds a different nonce per call', () => {
    assert.notEqual(buildCsp('one', false), buildCsp('two', false));
  });
});

describe('buildCsp (development)', () => {
  const policy = buildCsp('abc123', true);

  it('allows eval for scripts and inline styles for the dev server', () => {
    assert.match(directive(policy, 'script-src') ?? '', /'unsafe-eval'/);
    // Combining a nonce with 'unsafe-inline' would make browsers ignore the latter.
    assert.equal(directive(policy, 'style-src'), "style-src 'self' 'unsafe-inline'");
  });

  it('does not upgrade insecure requests', () => {
    assert.ok(!policy.includes('upgrade-insecure-requests'));
  });
});
