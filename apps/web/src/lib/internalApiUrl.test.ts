import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { internalApiUrl } from './internalApiUrl';

describe('internalApiUrl', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.INTERNAL_API_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      Reflect.deleteProperty(process.env, 'INTERNAL_API_URL');
    } else {
      process.env.INTERNAL_API_URL = original;
    }
  });

  it('defaults to localhost:8000 when unset', () => {
    Reflect.deleteProperty(process.env, 'INTERNAL_API_URL');
    assert.equal(internalApiUrl(), 'http://localhost:8000');
  });

  it('uses the configured value when set', () => {
    process.env.INTERNAL_API_URL = 'http://api:8000';
    assert.equal(internalApiUrl(), 'http://api:8000');
  });

  it('treats an empty value as unset', () => {
    process.env.INTERNAL_API_URL = '';
    assert.equal(internalApiUrl(), 'http://localhost:8000');
  });

  it('reflects environment changes between calls', () => {
    process.env.INTERNAL_API_URL = 'http://one:1';
    assert.equal(internalApiUrl(), 'http://one:1');
    process.env.INTERNAL_API_URL = 'http://two:2';
    assert.equal(internalApiUrl(), 'http://two:2');
  });
});
