import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALLOWED_WRITES } from './allowed_writes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(here)
  .filter((name) => name.endsWith('.mjs') && !name.endsWith('.test.mjs'))
  .map((name) => ({ name, text: readFileSync(join(here, name), 'utf8') }));
const workflow = readFileSync(join(here, '..', '..', '.github', 'workflows', 'triage.yml'), 'utf8');

const FORBIDDEN = [
  'child_process',
  'exec(',
  "'DELETE'",
  "'PUT'",
  'state:',
  'remove-label',
  'gh issue close',
];

test('triage sources contain no shell, destructive method or close operation', () => {
  assert.ok(sources.length >= 5);
  for (const { name, text } of sources) {
    for (const needle of FORBIDDEN) {
      assert.ok(!text.includes(needle), `${name} contains ${needle}`);
    }
  }
});

test('only github.mjs calls fetch', () => {
  for (const { name, text } of sources) {
    const calls = /(^|[^.\w])fetch\(|fetchImpl\(|globalThis\.fetch\b/.test(text);
    assert.equal(calls, name === 'github.mjs', name);
  }
});

test('the workflow interpolates no event data and runs only the triage script', () => {
  assert.ok(!workflow.includes('${{ github.event.'));
  assert.ok(!/\$\{\{[^}]*github\.event\./.test(workflow));
  const runs = workflow.match(/^\s*(?:-\s*)?run:.*$/gm) ?? [];
  assert.deepEqual(
    runs.map((line) => line.replace(/^\s*(?:-\s*)?run:\s*/, '')),
    ['node scripts/triage/run.mjs'],
  );
});

test('the workflow grants only contents read and issues write', () => {
  assert.match(workflow, /^permissions:\n {2}contents: read\n {2}issues: write\n/m);
});

test('the write allowlist is exactly the expected set', () => {
  assert.deepEqual(
    ALLOWED_WRITES.map((rule) => `${rule.method} ${rule.path.source} ${rule.target}`),
    [
      'POST ^\\/issues\\/([1-9]\\d{0,9})\\/labels$ candidate',
      'POST ^\\/issues\\/([1-9]\\d{0,9})\\/comments$ digest',
      'PATCH ^\\/issues\\/([1-9]\\d{0,9})$ digest',
    ],
  );
});
