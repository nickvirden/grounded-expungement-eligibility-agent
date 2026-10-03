import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { getResultMeta } from './page.utils.js';

// Mirrors apps/api/app/engine/rule_engine.py's _value_to_key: the API turns a
// result's human-readable label into the key the result page receives.
function engineResultKey(label: string): string {
  return label.toLowerCase().replace(/ /g, '_').replace(/-/g, '_');
}

const texasTree = JSON.parse(
  readFileSync(
    new URL('../../../../../../../packages/shared/state-trees/texas.json', import.meta.url),
    'utf8',
  ),
) as { results: Record<string, string> };

const DEFAULT_HEADLINE = getResultMeta(null).headline;

describe('getResultMeta', () => {
  it('resolves every result the Texas tree can emit to a specific outcome, not the default', () => {
    for (const label of Object.values(texasTree.results)) {
      const meta = getResultMeta(engineResultKey(label));
      assert.notEqual(meta.headline, DEFAULT_HEADLINE, `"${label}" fell through to the default`);
    }
  });

  it('shows "does not qualify" as a negative outcome', () => {
    assert.equal(getResultMeta('does_not_qualify').outcome, 'negative');
  });

  it('shows "does not qualify yet" as a conditional outcome', () => {
    assert.equal(getResultMeta('does_not_qualify_yet').outcome, 'conditional');
  });

  it('shows record-clearing results as positive outcomes', () => {
    for (const key of [
      'texas_expungement',
      'texas_dwi_record_sealing',
      'texas_juvenile_record_sealing',
      'texas_conviction_set_aside',
      'texas_felony_record_sealing',
      'texas_misdemeanor_record_sealing',
      'texas_automatic_record_sealing',
    ]) {
      assert.equal(getResultMeta(key).outcome, 'positive', key);
    }
  });

  it('still resolves the tree identifiers carried by older result URLs', () => {
    assert.equal(getResultMeta('expungement').outcome, 'positive');
    assert.equal(getResultMeta('dnq').outcome, 'negative');
    assert.equal(getResultMeta('dnqy').outcome, 'conditional');
  });

  it('falls back to the default for missing and unknown keys', () => {
    assert.equal(getResultMeta(null).headline, DEFAULT_HEADLINE);
    assert.equal(getResultMeta('no_such_result').headline, DEFAULT_HEADLINE);
  });

  it('does not resolve object-prototype property names', () => {
    assert.equal(getResultMeta('constructor').headline, DEFAULT_HEADLINE);
    assert.equal(getResultMeta('toString').headline, DEFAULT_HEADLINE);
  });
});
