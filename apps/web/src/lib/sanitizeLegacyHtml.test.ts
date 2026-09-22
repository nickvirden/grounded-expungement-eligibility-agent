import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitizeLegacyHtml } from './sanitizeLegacyHtml.js';

describe('sanitizeLegacyHtml', () => {
  it('keeps basic formatting tags', () => {
    const dirty = '<p>Hello <b>world</b><br/>and <u>friends</u></p>';
    const clean = sanitizeLegacyHtml(dirty);

    assert.match(clean, /<p>/);
    assert.match(clean, /<b>world<\/b>/);
    assert.match(clean, /<br\s*\/?>/);
    assert.match(clean, /<u>friends<\/u>/);
  });

  it('removes scripts and event handlers', () => {
    const dirty = '<p onclick="alert(1)">Hi</p><script>alert(1)</script>';
    const clean = sanitizeLegacyHtml(dirty);

    assert.doesNotMatch(clean, /<script/i);
    assert.doesNotMatch(clean, /onclick=/i);
    assert.match(clean, /<p>Hi<\/p>/);
  });
});

