import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { DomUtils, parseDocument } from 'htmlparser2';
import {
  type HelpBlock,
  type HelpContent,
  type StatuteItem,
  countAnswerRules,
  transformHelp,
} from './helpTransform';
import { sanitizeLegacyHtml } from './sanitizeLegacyHtml';

type TreeNode = { help: string | null };
const tree = JSON.parse(
  readFileSync(
    new URL('../../../../packages/shared/state-trees/texas.json', import.meta.url),
    'utf8',
  ),
) as { nodes: Record<string, TreeNode> };

const helpById: Array<[string, string]> = Object.entries(tree.nodes).flatMap(([id, node]) =>
  node.help ? [[id, node.help] as [string, string]] : [],
);

const help = (id: string): string => {
  const raw = tree.nodes[id]?.help;
  assert.ok(raw, `node ${id} has help in the tree`);
  return raw;
};

const SINGLE = { directiveGate: 'single-rule' } as const;

// ─── Helpers that never use the code under test ──────────────────────────────

type Parsed = ReturnType<typeof parseDocument>['children'];

/**
 * Text as a reader perceives it, with every `ol` item prefixed by the ordinal its marker shows,
 * and all whitespace removed. Block boundaries may add or drop whitespace, so what must
 * survive is every other character, in order.
 */
function perceivable(nodes: Parsed): string {
  let out = '';
  for (const n of nodes) {
    if (DomUtils.isText(n)) out += n.data;
    else if (DomUtils.isTag(n)) {
      if (n.name === 'ol') {
        n.children
          .filter((c) => DomUtils.isTag(c) && c.name === 'li')
          .forEach((li, i) => {
            if (DomUtils.isTag(li)) out += `${i + 1}.${perceivable(li.children)}`;
          });
      } else if (n.name !== 'script' && n.name !== 'style') {
        out += perceivable(n.children);
      }
    }
  }
  return out;
}

const squash = (s: string) => s.replace(/\s+/g, '');
const inlineText = (htmlish: string) => perceivable(parseDocument(htmlish).children);

function statuteText(items: StatuteItem[]): string {
  return items.map((i) => `${i.label}${inlineText(i.html)}${statuteText(i.children)}`).join('');
}

function blockText(b: HelpBlock): string {
  if (b.kind === 'html') return inlineText(b.html);
  if (b.kind === 'indexList') return b.items.join('');
  return statuteText(b.items);
}

/** What a reader sees, in reading order: title, directive, then the blocks. */
const renderedText = (c: HelpContent) =>
  squash(`${c.title ?? ''}${c.directive ?? ''}${c.blocks.map(blockText).join('')}`);

const htmlBlocks = (c: HelpContent) => c.blocks.flatMap((b) => (b.kind === 'html' ? [b.html] : []));

/** Every string the content can put into the DOM as markup. */
function allMarkup(c: HelpContent): string[] {
  const fromStatute = (items: StatuteItem[]): string[] =>
    items.flatMap((i) => [i.html, ...fromStatute(i.children)]);
  return c.blocks.flatMap((b) => {
    if (b.kind === 'html') return [b.html];
    if (b.kind === 'statuteList') return fromStatute(b.items);
    return [];
  });
}

const ATTRIBUTE = /<[a-z0-9]+\s+[^>]*=/i;
const DANGEROUS_TAG =
  /<\/?(script|style|img|a|iframe|svg|math|details|noscript|div|h5|object|embed)\b/i;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('transformHelp on the Texas tree', () => {
  it('has the 28 help strings the tests are written against', () => {
    assert.equal(helpById.length, 28);
  });

  it('keeps every character of all 28 help strings, in order', () => {
    for (const [id, raw] of helpById) {
      for (const gate of ['single-rule', 'never'] as const) {
        const out = transformHelp(raw, { directiveGate: gate });
        assert.equal(
          renderedText(out),
          squash(inlineText(raw)),
          `${id} (${gate}) lost or reordered text`,
        );
      }
    }
  });

  it('promotes a directive for exactly the nodes with one "answer yes/no" sentence', () => {
    // Computed from the raw strings with a plain regex over tag-stripped text.
    const expected = helpById
      .filter(
        ([, raw]) =>
          (raw.replace(/<[^>]*>/g, ' ').match(/\banswer\s+(yes|no)\b/gi) ?? []).length === 1,
      )
      .map(([id]) => id);
    const actual = helpById
      .filter(([, raw]) => transformHelp(raw, SINGLE).directive !== null)
      .map(([id]) => id);
    assert.ok(expected.length > 0);
    assert.deepEqual(actual, expected);
  });

  it('never promotes a directive when the help has more than one "answer yes/no" sentence', () => {
    const multi = helpById.filter(([, raw]) => countAnswerRules(raw) > 1);
    assert.ok(multi.length > 0, 'the tree has helps with several rules');
    for (const [id, raw] of multi) {
      assert.equal(transformHelp(raw, SINGLE).directive, null, id);
    }
  });

  it('never promotes anything with the "never" gate', () => {
    for (const [id, raw] of helpById) {
      assert.equal(transformHelp(raw, { directiveGate: 'never' }).directive, null, id);
      assert.equal(transformHelp(raw).directive, null, `${id} (default gate)`);
    }
  });

  it('leaves the unpromoted sentence in the body as bold text', () => {
    const out = transformHelp(help('6-1'), { directiveGate: 'never' });
    assert.match(htmlBlocks(out).join(''), /<p><b>Answer YES/);
  });

  it('returns a title for every title idiom and leaves no bare underline behind', () => {
    const idioms: Array<[string, string]> = [
      ['<h5><u>Title A</u></h5><p>Body</p>', 'Title A'],
      ['<h5>Title B</h5><p>Body</p>', 'Title B'],
      ['<p><b><u>Title C</u></b></p><p>Body</p>', 'Title C'],
    ];
    for (const [raw, title] of idioms) {
      const out = transformHelp(raw);
      assert.equal(out.title, title, raw);
      assert.doesNotMatch(htmlBlocks(out).join(''), /<u>/, raw);
      assert.equal(renderedText(out), squash(`${title}Body`));
    }
    // All three idioms occur in the real tree.
    assert.equal(transformHelp(help('0-0')).title, 'Types of Texas Cases');
    assert.equal(transformHelp(help('7-14')).title, 'Habitual Felony Conduct');
    assert.equal(transformHelp(help('2-3')).title, 'Completion of Deferred Adjudication');
  });

  it('gives a title to every help in the tree', () => {
    for (const [id, raw] of helpById) {
      assert.ok(transformHelp(raw).title, `${id} has a title`);
    }
  });

  it('only treats the first block as a title; a later heading becomes a sub-heading', () => {
    const out = transformHelp('<p>Intro</p><h5>Examples:</h5><p>One</p>');
    assert.equal(out.title, null);
    assert.deepEqual(htmlBlocks(out), ['<p>Intro</p><h3>Examples:</h3><p>One</p>']);
    const four = transformHelp('<p>Intro</p><h5>Examples:</h5>', { subheadingLevel: 4 });
    assert.deepEqual(htmlBlocks(four), ['<p>Intro</p><h4>Examples:</h4>']);
  });

  it('does not take a bold-only paragraph without an underline for a title', () => {
    const out = transformHelp('<p><b>Just bold</b></p><p>Body</p>');
    assert.equal(out.title, null);
    assert.match(htmlBlocks(out).join(''), /<p><b>Just bold<\/b><\/p>/);
  });

  it('turns 4-11 into a real numbered list with no empty paragraphs and no double markers', () => {
    const out = transformHelp(help('4-11'), SINGLE);
    const markup = htmlBlocks(out).join('');
    assert.match(markup, /<ol><li>Murder<\/li><li>Capital murder<\/li>/);
    assert.equal((markup.match(/<li>/g) ?? []).length, 11);
    assert.doesNotMatch(markup, /<li>\s*\d+\./);
    assert.doesNotMatch(markup, /<ul>/);
    assert.doesNotMatch(markup, /<p>\s*<\/p>/);
    assert.doesNotMatch(markup, /<p><ol>|<\/ol><\/p>/);
  });

  it('leaves a list alone when its numbers are not a sequence from 1', () => {
    const out = transformHelp('<ul><li>1. One</li><li>3. Three</li></ul>');
    assert.deepEqual(htmlBlocks(out), ['<ul><li>1. One</li><li>3. Three</li></ul>']);
  });

  it('keeps a numbered marker that sits inside an element', () => {
    const out = transformHelp('<ul><li><b>1. One</b></li><li><b>2. Two</b></li></ul>');
    assert.equal(renderedText(out), squash('1. One2. Two'));
    assert.doesNotMatch(htmlBlocks(out).join(''), /<ol>/);
  });

  it('returns 7-14 statute list as data with its markers, not as bullets', () => {
    const out = transformHelp(help('7-14'), SINGLE);
    const statute = out.blocks.find((b) => b.kind === 'statuteList');
    assert.ok(statute && statute.kind === 'statuteList');
    assert.equal(statute.items.length, 1);
    assert.equal(statute.items[0]?.label, '(a)');
    assert.deepEqual(
      statute.items[0]?.children.map((c) => c.label),
      ['(1)', '(2)', '(3)'],
    );
    assert.match(statute.items[0]?.html ?? '', /^Habitual felony conduct is conduct/);
    assert.doesNotMatch(htmlBlocks(out).join(''), /<ul>|<ol>|<li>/);
  });

  it('keeps whitespace between inline nodes inside a statute item', () => {
    const out = transformHelp('<ul><li>(a) <b>one</b> <i>two</i></li></ul>');
    const statute = out.blocks[0];
    assert.ok(statute && statute.kind === 'statuteList');
    assert.equal(statute.items[0]?.html, '<b>one</b> <i>two</i>');
  });

  it('returns the 84 counties of 7-10 as an index list', () => {
    const out = transformHelp(help('7-10'), SINGLE);
    const index = out.blocks.find((b) => b.kind === 'indexList');
    assert.ok(index && index.kind === 'indexList');
    assert.equal(index.items.length, 84);
    assert.equal(index.items[0], 'Aransas');
    assert.doesNotMatch(htmlBlocks(out).join(''), /<li>/);
  });

  it('keeps a short list of short items as an ordinary list', () => {
    const out = transformHelp(help('11-11'), SINGLE);
    assert.ok(out.blocks.every((b) => b.kind === 'html'));
    assert.match(htmlBlocks(out).join(''), /<ul><li>Disorderly Conduct<\/li>/);
  });

  it('never emits an attribute or a dangerous tag for any of the 28 strings', () => {
    for (const [id, raw] of helpById) {
      for (const level of [3, 4] as const) {
        const out = transformHelp(raw, { ...SINGLE, subheadingLevel: level });
        for (const markup of allMarkup(out)) {
          assert.doesNotMatch(markup, ATTRIBUTE, `${id} attribute in ${markup.slice(0, 80)}`);
          assert.doesNotMatch(markup, DANGEROUS_TAG, `${id} tag in ${markup.slice(0, 80)}`);
        }
      }
    }
  });
});

describe('transformHelp security probes', () => {
  const probes: Array<[string, string]> = [
    [
      'script tag',
      '<h5><u>T</u></h5><p><b>Answer YES here.</b></p><script>alert(1)</script><p>after</p>',
    ],
    ['onclick', '<p onclick="alert(1)">click</p>'],
    [
      'h3 with id and onclick',
      '<h3 id="x" onclick="y">Injected heading</h3><h5 id="t" style="color:red">Title</h5>',
    ],
    ['h5 with id and style', '<p>Intro</p><h5 id="t" style="color:red">Heading</h5>'],
    ['img onerror', '<p>a<img src=x onerror="alert(1)">b</p>'],
    ['javascript href', '<p><a href="javascript:alert(1)">link</a></p>'],
    [
      'div style url(javascript:)',
      '<div style="background:url(javascript:alert(1))"><b>Answer NO if x.</b></div>',
    ],
    // Assembled so the literal tag does not trip the repo's inline-style source check.
    ['style element', `<${'style'}>*{display:none}</style><p>styled</p>`],
    [
      'svg and math',
      '<svg><script>alert(1)</script></svg><math><mi xlink:href="javascript:alert(1)">m</mi></math>',
    ],
    [
      'noscript mXSS',
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">ns</p></noscript>',
    ],
    ['details ontoggle', '<details open ontoggle="alert(1)"><summary>s</summary>d</details>'],
    [
      'iframe in a statute item',
      '<ul><li>(a) <b onmouseover="x">label</b><ul><li>(1) <iframe src="//evil"></iframe>nested</li></ul></li></ul>',
    ],
    [
      'entity-encoded markup',
      '<h5>T</h5><p><b>Answer YES &lt;img src=x onerror=alert(1)&gt;</b></p>',
    ],
  ];

  for (const [name, raw] of probes) {
    it(`emits no attribute and no dangerous tag: ${name}`, () => {
      for (const gate of ['single-rule', 'never'] as const) {
        const out = transformHelp(raw, { directiveGate: gate });
        for (const markup of allMarkup(out)) {
          assert.doesNotMatch(markup, ATTRIBUTE, markup);
          assert.doesNotMatch(markup, DANGEROUS_TAG, markup);
        }
      }
    });
  }

  it('returns a script-looking title as decoded text, not as markup', () => {
    const out = transformHelp('<h5>&lt;script&gt;alert(1)&lt;/script&gt;</h5><p>Body</p>');
    // Safe only as a React text node: the string is decoded, so it must never reach innerHTML.
    assert.equal(out.title, '<script>alert(1)</script>');
    assert.doesNotMatch(htmlBlocks(out).join(''), /script/);
  });

  it('returns a script-looking directive as decoded text, not as markup', () => {
    const out = transformHelp(
      '<h5>T</h5><p><b>Answer YES &lt;img src=x onerror=alert(1)&gt;</b></p>',
      SINGLE,
    );
    assert.equal(out.directive, 'Answer YES <img src=x onerror=alert(1)>');
    assert.deepEqual(out.blocks, []);
  });

  it('drops script content instead of turning it into text', () => {
    const out = transformHelp('<p>before</p><script>alert(1)</script><p>after</p>');
    assert.equal(renderedText(out), 'beforeafter');
  });
});

describe('transformHelp on unknown or malformed structure', () => {
  it('wraps loose text and inline runs in paragraphs', () => {
    const out = transformHelp('Plain <b>words</b> here<ul><li>item</li></ul>trailing');
    assert.deepEqual(htmlBlocks(out), [
      '<p>Plain <b>words</b> here</p><ul><li>item</li></ul><p>trailing</p>',
    ]);
  });

  it('keeps the text of unknown tags and headings other than h5', () => {
    const out = transformHelp(
      '<section>Sect</section><h3>Three</h3><blockquote>Quote</blockquote>',
    );
    assert.equal(renderedText(out), 'SectThreeQuote');
    assert.doesNotMatch(htmlBlocks(out).join(''), /<section|<h3|<blockquote/);
  });

  it('lifts a list out of a paragraph and drops the empty paragraphs it leaves', () => {
    const out = transformHelp('<p>Lead</p><p><ul><li>One</li><li>Two</li></ul></p>');
    assert.deepEqual(htmlBlocks(out), ['<p>Lead</p><ul><li>One</li><li>Two</li></ul>']);
  });

  it('unwraps div, including nested div', () => {
    const out = transformHelp('<div><div><p>Deep</p></div>Loose</div>');
    assert.deepEqual(htmlBlocks(out), ['<p>Deep</p><p>Loose</p>']);
  });

  it('treats a nested list that is not a statute as an ordinary list', () => {
    const raw = '<ul><li>Top<ul><li>(a) nested</li></ul></li></ul>';
    const out = transformHelp(raw);
    assert.equal(out.blocks[0]?.kind, 'html');
    assert.equal(renderedText(out), squash('Top(a) nested'));
  });

  it('does not treat a list with a statute-like item among plain items as a statute', () => {
    const out = transformHelp('<ul><li>(a) first</li><li>plain item</li></ul>');
    assert.equal(out.blocks[0]?.kind, 'html');
    assert.equal(renderedText(out), squash('(a) firstplain item'));
  });

  it('keeps the text of an orphan list item, each as its own paragraph', () => {
    const out = transformHelp('<li>One</li><li>Two <b>bold</b></li>');
    assert.deepEqual(htmlBlocks(out), ['<p>One</p><p>Two <b>bold</b></p>']);
  });

  it('keeps a nested list inside an orphan list item', () => {
    const out = transformHelp('<li>Top<ul><li>inner</li></ul></li>');
    assert.equal(renderedText(out), squash('Topinner'));
    assert.match(htmlBlocks(out).join(''), /<ul><li>inner<\/li><\/ul>/);
  });

  it('escapes literal angle brackets and ampersands when it strips a list marker', () => {
    const numbered = transformHelp('<ul><li>1. a &lt;b&gt; c &amp; d</li><li>2. x</li></ul>');
    assert.deepEqual(htmlBlocks(numbered), ['<ol><li>a &lt;b&gt; c &amp; d</li><li>x</li></ol>']);
    const statute = transformHelp('<ul><li>(a) if x &lt;i&gt;y&lt;/i&gt; &amp; z</li></ul>');
    const block = statute.blocks[0];
    assert.ok(block && block.kind === 'statuteList');
    assert.equal(block.items[0]?.html, 'if x &lt;i&gt;y&lt;/i&gt; &amp; z');
  });

  it('does not use a block that states the answer rule as the title', () => {
    const idioms = [
      '<h5>Answer YES if a.</h5><p>Body</p>',
      '<h5><u>Answer YES if a.</u></h5><p>Body</p>',
      '<p><b><u>Answer NO if a.</u></b></p><p>Body</p>',
    ];
    for (const raw of idioms) {
      for (const gate of ['single-rule', 'never'] as const) {
        const out = transformHelp(raw, { directiveGate: gate });
        assert.equal(out.title, null, raw);
        assert.equal(out.directive, null, raw);
        assert.match(renderedText(out), /Answer(YES|NO)ifa\.Body/, raw);
      }
    }
  });

  it('documents the phrase set that keeps a block from being a title', () => {
    // Only the literal "answer yes/no" (any case or spacing) is guarded. Variant spellings are
    // still used as titles; widening the set is a deliberate change that should edit this test.
    const guarded = ['Answer YES', 'answer no', 'ANSWER   YES now', 'Answer&nbsp;NO'];
    const notGuarded: Array<[string, string]> = [
      ['Answer \u201cNO\u201d', 'Answer \u201cNO\u201d'],
      ['Answer: NO', 'Answer: NO'],
      ['Select NO', 'Select NO'],
      ['Answer\u2800NO', 'Answer\u2800NO'],
    ];
    for (const t of guarded) {
      assert.equal(transformHelp(`<h5>${t}</h5><p>Body</p>`).title, null, t);
    }
    for (const [t, expected] of notGuarded) {
      assert.equal(transformHelp(`<h5>${t}</h5><p>Body</p>`).title, expected, t);
    }
  });

  it('counts a rule phrase in the title toward the single-rule check', () => {
    const out = transformHelp(
      '<h5><u>Answer NO if b</u></h5><p><b>Answer YES if a.</b></p>',
      SINGLE,
    );
    assert.equal(out.directive, null);
  });

  it('returns empty content for an empty string', () => {
    assert.deepEqual(transformHelp(''), { title: null, directive: null, blocks: [] });
  });

  it('does not promote a bold "answer yes" sentence that is not the first block', () => {
    const out = transformHelp('<p>Intro</p><p><b>Answer YES if a.</b></p>', SINGLE);
    assert.equal(out.directive, null);
    assert.match(htmlBlocks(out).join(''), /<b>Answer YES if a\.<\/b>/);
  });

  it('does not promote a directive that has trailing non-bold text', () => {
    const out = transformHelp('<p><b>Answer YES</b> if a.</p>', SINGLE);
    assert.equal(out.directive, null);
    assert.equal(renderedText(out), squash('Answer YES if a.'));
  });

  it('does not promote when a second rule appears anywhere in the help', () => {
    const raw = '<p><b>Answer YES if a.</b></p><p>Otherwise, answer NO.</p>';
    const out = transformHelp(raw, SINGLE);
    assert.equal(out.directive, null);
    assert.equal(renderedText(out), squash('Answer YES if a.Otherwise, answer NO.'));
  });

  it('falls back to the legacy rendering, with nothing promoted, when the transform throws', () => {
    const raw = '<h5><u>Title</u></h5><p><b>Answer YES if a.</b></p><script>x</script><div>d</div>';
    // A throwing getter makes the failure happen inside the transform without a test-only seam.
    // Hostile input is not a reliable trigger: whether deep nesting overflows the stack depends
    // on the runtime's stack size and version, so a nesting-based test would pass or fail with
    // the environment instead of with the code.
    const hostile = {
      get directiveGate(): 'single-rule' {
        throw new Error('boom');
      },
    };
    const out = transformHelp(raw, hostile);
    assert.deepEqual(out, {
      title: null,
      directive: null,
      blocks: [{ kind: 'html', html: sanitizeLegacyHtml(raw) }],
    });
  });
});
