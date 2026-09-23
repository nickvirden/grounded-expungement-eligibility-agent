import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describeChatError } from './chatStreamError.js';

describe('describeChatError', () => {
  it('describes an expired or missing token as an invalid session', () => {
    assert.match(describeChatError(401, 'stream'), /session/i);
  });

  it('describes a mismatched-intake token distinctly from a missing one', () => {
    const forbidden = describeChatError(403, 'stream');
    const unauthorized = describeChatError(401, 'stream');
    assert.notEqual(forbidden, unauthorized);
  });

  it('describes a deleted intake as no longer existing', () => {
    assert.match(describeChatError(404, 'stream'), /no longer exists/i);
  });

  it('describes a replay attempt as already started', () => {
    assert.match(describeChatError(409, 'stream'), /already started/i);
  });

  it('describes a rate limit distinctly from other failures', () => {
    assert.match(describeChatError(429, 'create'), /too quickly/i);
  });

  it('describes a missing signing key as the feature being unavailable', () => {
    assert.match(describeChatError(503, 'create'), /unavailable/i);
  });

  it('falls back to a stage-specific generic message for an unrecognized status', () => {
    assert.equal(describeChatError(500, 'create'), 'Failed to start session (500)');
    assert.equal(describeChatError(502, 'stream'), 'Stream unavailable (502)');
  });
});
