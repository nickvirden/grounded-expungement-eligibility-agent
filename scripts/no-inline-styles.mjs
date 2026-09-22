#!/usr/bin/env node
/**
 * Belt-and-suspenders lint: fails the build if any .tsx file contains
 * a JSX `style={` attribute or an inline `<style>` tag.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const APPS_WEB = join(import.meta.dirname, '..', 'apps', 'web');
const VIOLATIONS = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (entry === 'node_modules' || entry === '.next') continue;
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isDirectory()) {
      walk(full);
    } else if (extname(entry) === '.tsx' || extname(entry) === '.ts') {
      checkFile(full);
    }
  }
}

function checkFile(filepath) {
  const content = readFileSync(filepath, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bstyle\s*=\s*\{/.test(line)) {
      VIOLATIONS.push({ file: filepath, line: i + 1, text: line.trim() });
    }
    if (/<style[\s>]/.test(line) && !line.includes('styled')) {
      VIOLATIONS.push({ file: filepath, line: i + 1, text: line.trim() });
    }
  }
}

walk(APPS_WEB);

if (VIOLATIONS.length > 0) {
  console.error('\n❌ Inline style violations found:\n');
  for (const v of VIOLATIONS) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}\n`);
  }
  console.error(`Total: ${VIOLATIONS.length} violation(s). Use styled-components instead.\n`);
  process.exit(1);
}

console.log('✓ No inline style violations found.');
