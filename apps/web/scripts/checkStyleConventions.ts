import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { findStyleViolations, isStylesFile } from './styleConventions.js';

const WEB_ROOT = join(import.meta.dirname, '..');
const SOURCE_ROOT = join(WEB_ROOT, 'src');
const SOURCE_FILE = /\.tsx?$/;
const DECLARATION_FILE = /\.d\.ts$/;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (SOURCE_FILE.test(entry.name) && !DECLARATION_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const files = listSourceFiles(SOURCE_ROOT).sort();
let violationCount = 0;

for (const file of files) {
  const shown = relative(WEB_ROOT, file);
  for (const v of findStyleViolations(file, readFileSync(file, 'utf8'))) {
    console.error(`${shown}:${v.line}  [${v.rule}]  ${v.text}`);
    violationCount += 1;
  }
}

// A wrong root path would scan nothing and pass vacuously.
if (!files.some((file) => isStylesFile(file))) {
  console.error(`No *.styles.ts(x) files found under ${SOURCE_ROOT}; the scan root is wrong.`);
  process.exit(1);
}

if (violationCount > 0) {
  console.error(`\n${violationCount} style convention violation(s).`);
  process.exit(1);
}

console.log(`Style conventions OK (${files.length} files scanned).`);
