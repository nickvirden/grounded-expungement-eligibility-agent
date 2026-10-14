import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { sha256 } from './sha256';

const reference = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const tree = JSON.parse(
  readFileSync(
    new URL('../../../../packages/shared/state-trees/texas.json', import.meta.url),
    'utf8',
  ),
) as {
  nodes: Record<
    string,
    { question: string; help: string | null; answers: Array<{ value: string }> }
  >;
};

describe('sha256', () => {
  it('matches the published test vectors', () => {
    assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('matches node:crypto across padding and block boundaries', () => {
    // 55, 56 and 64 bytes straddle the point where the length no longer fits in the block;
    // 119 and 120 do the same for the second block.
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 127, 128, 129, 1000]) {
      const s = 'a'.repeat(n);
      assert.equal(sha256(s), reference(s), `${n} bytes`);
    }
  });

  it('matches node:crypto on multi-byte Unicode, hashing UTF-8 bytes', () => {
    const samples = [
      'é',
      'é',
      '日本語のテキスト',
      '😀 emoji and 𝔘𝔫𝔦𝔠𝔬𝔡𝔢',
      '“smart quotes” — and an en–dash',
      'ñ'.repeat(70),
      '日'.repeat(41),
      'line one\nline two\u001fseparated\u001e',
    ];
    for (const s of samples) assert.equal(sha256(s), reference(s), JSON.stringify(s));
  });

  it('matches node:crypto on every question, answer and help string in the tree', () => {
    const texts = Object.values(tree.nodes).flatMap((n) => [
      n.question,
      n.help ?? '',
      ...n.answers.map((a) => a.value),
    ]);
    assert.ok(texts.length > 100);
    for (const s of texts) assert.equal(sha256(s), reference(s));
  });
});
