import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatStateName } from './LandingClient.utils.js';

describe('formatStateName', () => {
  it('returns known display names', () => {
    assert.equal(formatStateName('texas'), 'Texas');
    assert.equal(formatStateName('california'), 'California');
  });

  it('title-cases unknown keys', () => {
    assert.equal(formatStateName('new_hampshire'), 'New Hampshire');
  });

  it('handles single-word unknown keys', () => {
    assert.equal(formatStateName('ohio'), 'Ohio');
  });
});
