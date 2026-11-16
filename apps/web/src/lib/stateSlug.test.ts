import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isStateSlug } from './stateSlug.js';

describe('isStateSlug', () => {
  it('accepts well-formed slugs in any case', () => {
    for (const slug of ['texas', 'Texas', 'new-york', 'new_york', 'a1']) {
      assert.equal(isStateSlug(slug), true, slug);
    }
  });

  it('rejects anything that could change the API path or query', () => {
    const rejected = [
      '',
      '..',
      '.',
      '..%2Fhealthz',
      '..%2F..%2Fhealthz',
      'a%2Fb',
      'a/b',
      '../healthz',
      'a?x=1',
      'a#b',
      'a b',
      'a%00b',
      '-texas',
      '_texas',
      '1texas',
      'texas\n',
    ];
    for (const slug of rejected) {
      assert.equal(isStateSlug(slug), false, JSON.stringify(slug));
    }
  });
});
