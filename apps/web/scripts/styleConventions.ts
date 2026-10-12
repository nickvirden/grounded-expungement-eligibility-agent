/**
 * Static style conventions for apps/web sources. Pure rules; the CLI in
 * checkStyleConventions.ts feeds them files.
 *
 * Why each rule exists (DECISIONS §8 and §19):
 *
 * - missing-use-client: the production CSP authorises styles by nonce only. styled-components
 *   emits an un-nonced `<style>` when a styled component renders in a Server Component, and the
 *   browser blocks it, shipping the page unstyled. Every `*.styles.ts(x)` therefore opens with
 *   `'use client'` so its components render through the nonced registry. The dev-server policy
 *   CI runs under allows inline styles, so a missing directive only surfaces in production
 *   unless it is caught statically.
 * - inline-style-prop: a `style={...}` attribute is an inline style, which `style-src` blocks.
 * - inline-style-tag: a literal `<style>` element is un-nonced inline CSS, blocked the same way.
 */

export type StyleRule = 'missing-use-client' | 'inline-style-prop' | 'inline-style-tag';

export interface StyleViolation {
  rule: StyleRule;
  line: number;
  text: string;
}

const STYLES_FILE = /\.styles\.tsx?$/;
const DECLARATION_FILE = /\.d\.ts$/;
// A directive is only honoured as the first statement, so it must end at `;`, a newline or EOF.
const USE_CLIENT_DIRECTIVE = /^(['"])use client\1\s*(;|\n|$)/;
const INLINE_STYLE_PROP = /\bstyle\s*=\s*\{/;
const INLINE_STYLE_TAG = /<style[\s>/]/;
// A BOM, whitespace, `//` comments and `/* */` comments may precede the directive.
const LEADING_TRIVIA = /^(?:﻿|\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)+/;

function hasLeadingUseClient(source: string): boolean {
  return USE_CLIENT_DIRECTIVE.test(source.replace(LEADING_TRIVIA, ''));
}

export function findStyleViolations(path: string, source: string): StyleViolation[] {
  if (DECLARATION_FILE.test(path)) return [];

  const violations: StyleViolation[] = [];

  if (STYLES_FILE.test(path) && !hasLeadingUseClient(source)) {
    violations.push({
      rule: 'missing-use-client',
      line: 1,
      text: "styles files must start with 'use client'",
    });
  }

  const lines = source.split('\n');
  for (const [index, text] of lines.entries()) {
    if (INLINE_STYLE_PROP.test(text)) {
      violations.push({ rule: 'inline-style-prop', line: index + 1, text: text.trim() });
    }
    if (INLINE_STYLE_TAG.test(text)) {
      violations.push({ rule: 'inline-style-tag', line: index + 1, text: text.trim() });
    }
  }

  return violations;
}
