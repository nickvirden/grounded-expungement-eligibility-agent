import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { answerLabels, candidateRule, fingerprint } from '@/lib/helpRuleLedger';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ServerStyleSheet } from 'styled-components';

// Node's ESM loader resolves styled-components to its CommonJS build and hands a default import
// the whole `module.exports` object, so `styled.div` is undefined. Bundlers use the ESM build,
// where the default export is the `styled` function. Copying the factory's tag helpers onto the
// exports object gives the component styles the same shape here. It must run before the
// component module is loaded, hence the dynamic import.
const exportsObject = createRequire(import.meta.url)('styled-components') as Record<
  string,
  unknown
>;
if (typeof exportsObject.div !== 'function') {
  Object.assign(exportsObject, exportsObject.default);
}
// The tsconfig keeps JSX untransformed for Next, so tsx compiles this module's JSX to
// `React.createElement`; the global stands in for the automatic runtime Next provides.
(globalThis as { React?: unknown }).React = await import('react');
const { HelpSection } = await import('./HelpDialog');

interface TreeNode {
  question: string;
  help: string | null;
  answers: Array<{ value: string }>;
}

const tree: { nodes: Record<string, TreeNode> } = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '../../../../packages/shared/state-trees/texas.json'),
    'utf8',
  ),
);
const node = (id: string): TreeNode => {
  const n = tree.nodes[id];
  assert.ok(n, `node ${id}`);
  return n;
};

/** A ledger file value approving exactly the given node, computed through the library. */
function ledgerApproving(id: string) {
  const n = node(id);
  const rule = candidateRule(n.help ?? '');
  assert.ok(rule, `${id} has a promotable rule`);
  const { hash, fields } = fingerprint({
    state: 'texas',
    question: n.question,
    rule,
    help: n.help ?? '',
    answers: answerLabels(n.answers),
  });
  return {
    version: 1,
    entries: {
      [`texas:${id}`]: {
        reviewed: true,
        hash,
        fields,
        reviewedBy: 'test-only',
        reviewedAt: '2026-10-14',
      },
    },
  };
}

/** Server-renders the section with its styles, so class names can be resolved to CSS rules. */
function render(id: string, ledger?: unknown) {
  const n = node(id);
  const sheet = new ServerStyleSheet();
  try {
    const html = renderToString(
      sheet.collectStyles(
        createElement(HelpSection, {
          state: 'texas',
          question: n.question,
          help: n.help,
          answers: n.answers,
          ledger,
        }),
      ),
    );
    return { html, css: sheet.getStyleTags() };
  } finally {
    sheet.seal();
  }
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

describe('HelpSection with a reviewed rule', () => {
  const id = '11-11';
  const rule = candidateRule(node(id).help ?? '') ?? '';
  const { html, css } = render(id, ledgerApproving(id));

  it('shows the box before the Help button, in markup order', () => {
    const box = html.indexOf('How to answer');
    const button = html.indexOf('<button');
    assert.ok(box >= 0, 'box is rendered');
    assert.ok(button > box, 'the Help button follows the box');
  });

  it('shows the rule sentence once, so it is not repeated inside the dialog body', () => {
    assert.ok(rule.length > 0);
    assert.equal(occurrences(html, rule), 1);
  });

  it('labels the box "How to answer"', () => {
    assert.match(html, /<p[^>]*>How to answer<\/p>/);
  });

  it('draws the box without a left border', () => {
    const boxClasses = (/<div class="([^"]+)"><p[^>]*>How to answer/.exec(html)?.[1] ?? '')
      .split(' ')
      .filter(Boolean);
    assert.ok(boxClasses.length > 0, 'found the box element');
    const rules = boxClasses.flatMap((c) =>
      [...css.matchAll(new RegExp(`\\.${c}\\{([^}]*)\\}`, 'g'))].map((m) => m[1] ?? ''),
    );
    assert.ok(rules.length > 0, 'found the box styles');
    for (const declarations of rules) assert.doesNotMatch(declarations, /border-left/);
  });

  it('keeps the Help button for the rest of the help', () => {
    assert.match(html, /<b>Help:<\/b> Disorderly Conduct Offenses/);
  });
});

describe('HelpSection without a review', () => {
  it('shows no box for a node the ledger does not approve', () => {
    // The ledger approves 11-11 only; 11-9 is a different node.
    const { html } = render('11-9', ledgerApproving('11-11'));
    assert.doesNotMatch(html, /How to answer/);
    assert.match(html, /aria-haspopup="dialog"/);
  });

  it('shows no box with an empty ledger, and keeps the rule sentence in the dialog body', () => {
    const { html } = render('11-11', { version: 1, entries: {} });
    const rule = candidateRule(node('11-11').help ?? '') ?? '';
    assert.doesNotMatch(html, /How to answer/);
    assert.equal(occurrences(html, rule), 1);
  });

  it('renders nothing for a node with no help', () => {
    const { html } = render('2-6');
    assert.equal(html, '');
  });
});
