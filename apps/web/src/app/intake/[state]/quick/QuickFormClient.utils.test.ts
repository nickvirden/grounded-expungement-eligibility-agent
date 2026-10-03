import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { computeProgress, describeProgress } from './QuickFormClient.utils.js';

describe('computeProgress', () => {
  it('starts at zero before anything is answered', () => {
    assert.equal(computeProgress(0, 18), 0);
  });

  it('is the share of answered steps out of answered plus estimated remaining', () => {
    assert.equal(computeProgress(3, 9), 0.25);
  });

  it('follows a revised estimate instead of a fixed starting total', () => {
    // A branch that turns out longer than first estimated lowers the fraction.
    assert.ok(computeProgress(4, 12) < computeProgress(3, 4));
  });

  it('reaches one when nothing remains', () => {
    assert.equal(computeProgress(5, 0), 1);
  });

  it('is zero when there is nothing answered and nothing remaining', () => {
    assert.equal(computeProgress(0, 0), 0);
  });

  it('treats a negative estimate as nothing remaining', () => {
    assert.equal(computeProgress(2, -3), 1);
  });
});

describe('describeProgress', () => {
  it('labels the remainder as an estimate', () => {
    const { summary, valueText } = describeProgress(3, 9);
    assert.equal(summary, '3 answered · about 9 left');
    assert.equal(valueText, '3 answered, about 9 remaining');
  });

  it('says last question instead of "about 0 left"', () => {
    for (const remaining of [1, 0]) {
      const { summary, valueText } = describeProgress(7, remaining);
      assert.equal(summary, '7 answered · last question');
      assert.equal(valueText, '7 answered, last question');
    }
  });
});
