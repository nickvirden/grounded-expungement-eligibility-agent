#!/usr/bin/env node
/**
 * Static analysis: assert no inline `style` props exist in any .tsx/.ts source file.
 *
 * Inline styles (`style={{ color: 'red' }}`) break CSP strict-source enforcement
 * (`style-src 'nonce-...'`) and violate the project's styling conventions.
 *
 * All styles must live in co-located *.styles.ts files as styled-components.
 *
 * Usage:  node scripts/check-no-inline-styles.mjs
 * Exit:   0 = clean, 1 = violations found
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..', 'apps', 'web', 'src');

// Matches: style={{ ... }} or style={someVar}
// We want to flag both hard-coded objects and any dynamic style prop.
const INLINE_STYLE_RE = /\bstyle=\{/g;

// Allowlist: patterns we intentionally accept.
// Currently empty — no exceptions granted.
const ALLOWLIST = [];

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      // Skip *.styles.ts — those are styled-components definitions, not JSX
      if (!entry.endsWith('.styles.ts') && !entry.endsWith('.d.ts')) {
        files.push(full);
      }
    }
  }
  return files;
}

const files = walk(ROOT);
const violations = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, idx) => {
    if (INLINE_STYLE_RE.test(line)) {
      // Reset lastIndex after global regex test
      INLINE_STYLE_RE.lastIndex = 0;

      const isAllowed = ALLOWLIST.some((pattern) => pattern.test(line));
      if (!isAllowed) {
        violations.push({
          file: relative(process.cwd(), file),
          line: idx + 1,
          text: line.trim(),
        });
      }
    }
    INLINE_STYLE_RE.lastIndex = 0;
  });
}

if (violations.length === 0) {
  console.log('✔  No inline styles found.');
  process.exit(0);
} else {
  console.error(`✖  Found ${violations.length} inline style violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  process.exit(1);
}
