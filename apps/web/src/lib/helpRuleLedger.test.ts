import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  type Ledger,
  type LedgerEntry,
  answerLabels,
  approvedHashes,
  candidateRule,
  decideHelp,
  fingerprint,
  formatReviewSheet,
  parseLedger,
  reviewText,
} from './helpRuleLedger';
import { countAnswerRules, plainText, transformHelp } from './helpTransform';
import { sha256 } from './sha256';

interface TreeNode {
  question: string;
  help: string | null;
  answers: Array<{ value: string }>;
}
interface Tree {
  state: string;
  nodes: Record<string, TreeNode>;
}

const treeUrl = (state: string) =>
  new URL(`../../../../packages/shared/state-trees/${state}.json`, import.meta.url);
const loadTree = (state: string): Tree | null =>
  existsSync(treeUrl(state)) ? (JSON.parse(readFileSync(treeUrl(state), 'utf8')) as Tree) : null;

const texas = loadTree('texas');
assert.ok(texas, 'the Texas tree exists');
const node = (id: string): TreeNode => {
  const n = texas.nodes[id];
  assert.ok(n, `node ${id} exists`);
  return n;
};

const inputFor = (id: string, state = 'texas') => {
  const n = node(id);
  assert.ok(n.help, `node ${id} has help`);
  return { state, question: n.question, help: n.help, answers: n.answers };
};

/** A ledger entry for the node's current content, as a reviewer would have recorded it. */
function entryFor(id: string): LedgerEntry {
  const i = inputFor(id);
  const rule = candidateRule(i.help);
  assert.ok(rule, `node ${id} has a single rule`);
  const fp = fingerprint({
    state: i.state,
    question: i.question,
    rule,
    help: i.help,
    answers: answerLabels(i.answers),
  });
  return {
    reviewed: true,
    hash: fp.hash,
    fields: fp.fields,
    reviewedBy: 'test-reviewer',
    reviewedAt: '2026-01-01',
  };
}

const ledgerOf = (ids: string[]): Ledger => ({
  version: 1,
  entries: Object.fromEntries(ids.map((id) => [`texas:${id}`, entryFor(id)])),
});

const bold = (c: { blocks: Array<{ kind: string; html?: string }> }, sentence: string) =>
  c.blocks.some((b) => b.kind === 'html' && b.html?.includes(`<b>${sentence}`));

describe('help rule ledger: promotion', () => {
  it('promotes nothing with an empty ledger', () => {
    const approved = approvedHashes({ version: 1, entries: {} });
    for (const [id, n] of Object.entries(texas.nodes)) {
      if (!n.help) continue;
      const d = decideHelp(inputFor(id), approved);
      assert.equal(d.promoted, false, id);
      assert.equal(d.content.directive, null, id);
    }
  });

  it('keeps an unreviewed rule in the body as bold text, unreworded', () => {
    const d = decideHelp(inputFor('11-11'), approvedHashes(ledgerOf([])));
    assert.equal(d.reason, 'not-reviewed');
    assert.ok(bold(d.content, 'Answer YES to this question if you were convicted of a violation'));
    assert.equal(d.content.title, 'Disorderly Conduct Offenses');
  });

  it('promotes a node whose reviewed content still matches', () => {
    const d = decideHelp(inputFor('11-11'), approvedHashes(ledgerOf(['11-11'])));
    assert.equal(d.promoted, true);
    assert.equal(d.reason, 'promoted');
    assert.match(d.content.directive ?? '', /^Answer YES to this question if you were convicted/);
  });

  it('promotes only the reviewed nodes', () => {
    const approved = approvedHashes(ledgerOf(['11-11', '15-1']));
    const promoted = Object.entries(texas.nodes)
      .filter(([, n]) => n.help)
      .filter(([id]) => decideHelp(inputFor(id), approved).promoted)
      .map(([id]) => id);
    assert.deepEqual(promoted.sort(), ['11-11', '15-1']);
  });

  it('approves a variant node whose reviewed content is identical', () => {
    // 5-2 and 6-1 sit in different groups (5 and 6), which the client knows, but their
    // question, help and answers are identical. Lookup is by content, so one approval covers both.
    const approved = approvedHashes(ledgerOf(['5-2']));
    assert.equal(decideHelp(inputFor('5-2'), approved).promoted, true);
    assert.equal(decideHelp(inputFor('6-1'), approved).promoted, true);
  });

  it('stops promoting when one word of the rule changes', () => {
    const i = inputFor('11-11');
    const approved = approvedHashes(ledgerOf(['11-11']));
    const mutated = { ...i, help: i.help.replace('convicted of', 'charged with') };
    assert.notEqual(mutated.help, i.help);
    const d = decideHelp(mutated, approved);
    assert.equal(d.promoted, false);
    assert.equal(d.reason, 'not-reviewed');
    assert.equal(d.content.directive, null);
  });

  it('stops promoting when the rule is negated', () => {
    const i = inputFor('11-11');
    const mutated = {
      ...i,
      help: i.help.replace('if you were convicted', 'if you were NOT convicted'),
    };
    assert.equal(decideHelp(mutated, approvedHashes(ledgerOf(['11-11']))).promoted, false);
  });

  it('stops promoting when one word of the question changes', () => {
    const i = inputFor('11-11');
    const mutated = { ...i, question: i.question.replace('convicted', 'charged') };
    assert.notEqual(mutated.question, i.question);
    assert.equal(decideHelp(mutated, approvedHashes(ledgerOf(['11-11']))).promoted, false);
  });

  it('stops promoting when one answer label changes', () => {
    const i = inputFor('11-11');
    const mutated = {
      ...i,
      answers: [
        { value: answerLabels(i.answers)[0] },
        { value: 'No, this was for something else' },
      ],
    };
    assert.equal(decideHelp(mutated, approvedHashes(ledgerOf(['11-11']))).promoted, false);
  });

  it('is sensitive to case, punctuation and answer order', () => {
    const i = inputFor('11-11');
    const approved = approvedHashes(ledgerOf(['11-11']));
    assert.equal(
      decideHelp({ ...i, help: i.help.replace('Answer YES', 'Answer Yes') }, approved).promoted,
      false,
    );
    assert.equal(
      decideHelp(
        {
          ...i,
          help: i.help.replace('Disorderly Conduct Offenses.', 'Disorderly Conduct Offenses'),
        },
        approved,
      ).promoted,
      false,
    );
    assert.equal(decideHelp({ ...i, answers: [...i.answers].reverse() }, approved).promoted, false);
  });

  it('ignores markup and whitespace differences that a reader cannot see', () => {
    const i = inputFor('11-11');
    const approved = approvedHashes(ledgerOf(['11-11']));
    const reflowed = {
      ...i,
      question: `  <b>${i.question.replace(' or ', '  or\n')}</b> `,
      answers: i.answers.map((a) => ({ value: `<i>${a.value}</i>` })),
    };
    assert.equal(decideHelp(reflowed, approved).promoted, true);
  });

  it('treats canonically equivalent Unicode as the same text', () => {
    const base = { state: 'texas', answers: [{ value: 'Yes' }, { value: 'No' }] };
    const help = '<h5>T</h5><p><b>Answer YES if a.</b></p>';
    const fp = fingerprint({
      state: base.state,
      question: 'Was it a caf\u00e9?',
      rule: 'Answer YES if a.',
      help,
      answers: ['Yes', 'No'],
    });
    const approved = new Set([fp.hash]);
    const composed = { ...base, question: 'Was it a caf\u00e9?', help };
    const decomposed = { ...base, question: 'Was it a cafe\u0301?', help };
    assert.notEqual(composed.question, decomposed.question);
    assert.equal(decideHelp(composed, approved).promoted, true);
    assert.equal(decideHelp(decomposed, approved).promoted, true);
  });

  it('never promotes a help with two "answer yes/no" sentences, even with an entry', () => {
    const i = inputFor('2-3');
    const firstRule =
      'If your deferred adjudication sentence was revoked, answer NO to this question.';
    const fp = fingerprint({
      state: 'texas',
      question: i.question,
      rule: firstRule,
      help: i.help,
      answers: answerLabels(i.answers),
    });
    const d = decideHelp(i, new Set([fp.hash]));
    assert.equal(d.promoted, false);
    assert.equal(d.reason, 'more-than-one-rule');
    assert.equal(d.content.directive, null);
  });

  it('reports a help without a rule as having no rule', () => {
    assert.equal(decideHelp(inputFor('1-1'), approvedHashes(ledgerOf([]))).reason, 'no-rule');
  });

  it('reports a single rule outside the first bold paragraph as such, not as no rule', () => {
    const base = { state: 'texas', question: 'Q?', answers: [{ value: 'Yes' }, { value: 'No' }] };
    const cases = [
      '<h5>T</h5><p>Intro</p><p><b>Answer YES if a.</b></p>',
      '<h5>T</h5><p>Answer YES if a.</p>',
      '<h5>T</h5><p><b>Answer YES</b> if a.</p>',
    ];
    for (const help of cases) {
      const d = decideHelp({ ...base, help }, new Set());
      assert.equal(d.reason, 'rule-not-in-first-paragraph', help);
      assert.equal(d.promoted, false);
    }
    assert.equal(
      decideHelp({ ...base, help: '<h5>T</h5><p>Body</p>' }, new Set()).reason,
      'no-rule',
    );
  });

  it('does not promote the same content under a different state, and does not throw', () => {
    const approved = approvedHashes(ledgerOf(['11-11']));
    const d = decideHelp(inputFor('11-11', 'oklahoma'), approved);
    assert.equal(d.promoted, false);
    const empty = decideHelp(
      inputFor('11-11', 'oklahoma'),
      approvedHashes({ version: 1, entries: {} }),
    );
    assert.equal(empty.promoted, false);
  });

  it('promotes nothing for a state whose tree has no entries and is not in the repo', () => {
    const synthetic = {
      state: 'oklahoma',
      question: 'Were you convicted?',
      help: '<h5><u>Rule</u></h5><p><b>Answer YES if you were convicted.</b></p>',
      answers: [{ value: 'Yes' }, { value: 'No' }],
    };
    assert.doesNotThrow(() => decideHelp(synthetic, approvedHashes(ledgerOf(['11-11']))));
    assert.equal(decideHelp(synthetic, approvedHashes(undefined)).promoted, false);
  });

  it('uses the committed ledger by default, which approves nothing it was not shown', () => {
    const unreviewed = {
      state: 'texas',
      question: 'A question that no reviewer has ever seen?',
      help: '<h5>T</h5><p><b>Answer YES if this is new.</b></p>',
      answers: [{ value: 'Yes' }, { value: 'No' }],
    };
    assert.equal(decideHelp(unreviewed).promoted, false);
  });
});

const entriesOf = (value: unknown) => Object.fromEntries(parseLedger(value).entries);

describe('help rule ledger: reading the file value', () => {
  const malformed: unknown[] = [
    undefined,
    null,
    '',
    'ledger',
    42,
    [],
    {},
    { version: 2, entries: {} },
    { version: 1 },
    { version: 1, entries: null },
    { version: 1, entries: [] },
    { version: 1, entries: 'x' },
    { version: 1, entries: { 'texas:1-1': null } },
    { version: 1, entries: { 'texas:1-1': { reviewed: false, hash: 'a'.repeat(64) } } },
    { version: 1, entries: { 'texas:1-1': { reviewed: true } } },
    { version: 1, entries: { 'texas:1-1': { reviewed: true, hash: 'not-hex' } } },
    { version: 1, entries: { 'texas:1-1': { reviewed: true, hash: 'A'.repeat(64) } } },
  ];

  it('treats a missing or malformed ledger as empty', () => {
    for (const value of malformed) {
      assert.deepEqual(entriesOf(value), {}, JSON.stringify(value));
      assert.equal(approvedHashes(value).size, 0, JSON.stringify(value));
    }
  });

  it('promotes nothing when the ledger is malformed', () => {
    for (const value of malformed) {
      assert.equal(decideHelp(inputFor('11-11'), approvedHashes(value)).promoted, false);
    }
  });

  it('keeps well-formed entries beside malformed ones', () => {
    const good = entryFor('11-11');
    const approved = approvedHashes({
      version: 1,
      entries: { 'texas:11-11': good, 'texas:bad': { reviewed: true, hash: 'x' } },
    });
    assert.deepEqual([...approved], [good.hash]);
  });
});

describe('help rule ledger: unfinished or hostile entries', () => {
  const good = () => entryFor('11-11');
  const withEntry = (entry: unknown) => ({ version: 1, entries: { 'texas:11-11': entry } });
  const approves = (entry: unknown) =>
    decideHelp(inputFor('11-11'), approvedHashes(withEntry(entry))).promoted;

  it('accepts a complete entry', () => {
    assert.equal(approves(good()), true);
  });

  it('rejects entries whose reviewer is empty or a placeholder', () => {
    for (const reviewedBy of [
      '',
      '   ',
      undefined,
      null,
      42,
      'PLACEHOLDER',
      'placeholder (seeded)',
      'Seeded: PlaceHolder',
    ]) {
      assert.equal(approves({ ...good(), reviewedBy }), false, JSON.stringify(reviewedBy));
    }
  });

  it('rejects entries whose review date is not a valid ISO date', () => {
    for (const reviewedAt of ['', 'yesterday', '2026-13-45', '10/13/2026', undefined, 20260101]) {
      assert.equal(approves({ ...good(), reviewedAt }), false, JSON.stringify(reviewedAt));
    }
    assert.equal(approves({ ...good(), reviewedAt: '2026-10-13T09:30:00Z' }), true);
  });

  it('ignores a ledger of another version even when its entries are valid', () => {
    for (const version of [2, 0, '1', undefined]) {
      const ledger = { version, entries: { 'texas:11-11': good() } };
      assert.equal(approvedHashes(ledger).size, 0, JSON.stringify(version));
    }
  });

  it('treats __proto__ and constructor keys as ordinary keys and pollutes nothing', () => {
    // Written as text: an object literal with `__proto__` would set a prototype, not a key.
    const e = JSON.stringify(good());
    const text = `{"version":1,"entries":{"__proto__":${e},"constructor":${e},"texas:11-11":${e}}}`;
    const ledger = parseLedger(JSON.parse(text));
    assert.ok(ledger.entries instanceof Map);
    assert.equal(({} as Record<string, unknown>).reviewed, undefined);
    assert.equal(({} as Record<string, unknown>).hash, undefined);
    assert.ok(ledger.entries.has('__proto__'));
    assert.ok(ledger.entries.has('constructor'));
    assert.equal(decideHelp(inputFor('11-11'), approvedHashes(JSON.parse(text))).promoted, true);
    assert.equal(decideHelp(inputFor('14-3'), approvedHashes(JSON.parse(text))).promoted, false);
  });
});

describe('help rule ledger: strict entry checks', () => {
  const good = () => entryFor('11-11');
  const approves = (entry: unknown) =>
    approvedHashes({ version: 1, entries: { 'texas:11-11': entry } }).size === 1;

  it('rejects an entry whose only defect is reviewed: false', () => {
    assert.equal(approves(good()), true);
    assert.equal(approves({ ...good(), reviewed: false }), false);
    assert.equal(approves({ ...good(), reviewed: 'true' }), false);
    assert.equal(
      decideHelp(
        inputFor('11-11'),
        approvedHashes({ version: 1, entries: { k: { ...good(), reviewed: false } } }),
      ).promoted,
      false,
    );
  });

  it('rejects an entry whose only defect is an uppercase hash', () => {
    const upper = { ...good(), hash: good().hash.toUpperCase() };
    assert.notEqual(upper.hash, good().hash);
    assert.equal(approves(upper), false);
    assert.equal(
      decideHelp(inputFor('11-11'), approvedHashes({ version: 1, entries: { k: upper } })).promoted,
      false,
    );
  });

  it('rejects reviewers made only of whitespace or invisible characters', () => {
    for (const reviewedBy of [
      '\u200b',
      '\u200b\u200c\u200d',
      '\ufeff',
      '\u2800',
      '\u3164',
      '\u00a0 \t',
      '\u202e',
    ]) {
      assert.equal(approves({ ...good(), reviewedBy }), false, JSON.stringify(reviewedBy));
    }
  });

  it('rejects reviewers that normalise to a stand-in', () => {
    for (const reviewedBy of [
      'PLACEHOLDER',
      'P\u200bLACE\u200bHOLDER',
      '\uff30\uff2c\uff21\uff23\uff25\uff28\uff2f\uff2c\uff24\uff25\uff32',
      'place holder',
      'TBD',
      't b d',
      'ToDo',
      'TODO',
      '-',
      ' - ',
      '\uff0d',
    ]) {
      assert.equal(approves({ ...good(), reviewedBy }), false, JSON.stringify(reviewedBy));
    }
    assert.equal(approves({ ...good(), reviewedBy: 'Dana Todorov' }), true);
    assert.equal(approves({ ...good(), reviewedBy: 'nickvirden' }), true);
  });

  it('rejects calendar-invalid and implausible review dates', () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    for (const reviewedAt of [
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2026-04-31',
      '2025-02-29',
      '0000-01-01',
      '2023-12-31',
      '2999-01-01',
      future,
      '2026-01-01T25:00:00Z',
      '2026-01-01T10:61:00Z',
      '2026-01-01T10:00',
    ]) {
      assert.equal(approves({ ...good(), reviewedAt }), false, reviewedAt);
    }
    for (const reviewedAt of [
      '2024-02-29',
      '2026-01-01',
      '2026-01-01T10:30:00Z',
      '2026-01-01T10:30:00.123+02:00',
    ]) {
      assert.equal(approves({ ...good(), reviewedAt }), true, reviewedAt);
    }
    assert.equal(approves({ ...good(), reviewedAt: new Date().toISOString() }), true);
  });
});

describe('help rule ledger: the whole help text is covered', () => {
  const reviewed = approvedHashes(ledgerOf(['11-11']));
  const withBody = (extra: string) => {
    const i = inputFor('11-11');
    return { ...i, help: `${i.help}${extra}` };
  };

  // Phrasings that read as an answer instruction but are not the literal "answer yes/no".
  const evasions: Array<[string, string]> = [
    ['quoted answer', '<p>Otherwise answer "NO".</p>'],
    ['curly-quoted answer', '<p>Otherwise answer \u201cNO\u201d.</p>'],
    ['colon after answer', '<p>Otherwise answer: NO.</p>'],
    ['answer this question', '<p>If not, answer this question NO.</p>'],
    ['select', '<p>Otherwise select NO.</p>'],
    ['braille blank as a space', '<p>Otherwise answer\u2800NO.</p>'],
    ['hangul filler as a space', '<p>Otherwise answer\u3164NO.</p>'],
    ['zero-width space', '<p>Otherwise answer\u200bNO.</p>'],
    ['soft hyphen inside the word', '<p>Otherwise an\u00adswer NO.</p>'],
    ['tag inside the word', '<p>Otherwise ans<b>wer</b> NO.</p>'],
    ['literal second rule', '<p>Otherwise answer NO.</p>'],
    ['a negating qualifier', '<p>This does not apply if you were NOT convicted.</p>'],
  ];

  it('promotes the unchanged help', () => {
    assert.equal(decideHelp(inputFor('11-11'), reviewed).promoted, true);
  });

  for (const [name, extra] of evasions) {
    it(`stops promoting when the body gains: ${name}`, () => {
      const d = decideHelp(withBody(extra), reviewed);
      assert.equal(d.promoted, false);
      assert.equal(d.content.directive, null);
    });
  }

  it('relies on the hash, not the literal phrase check, for phrasings the check cannot see', () => {
    const blind = evasions.filter(([, extra]) => countAnswerRules(withBody(extra).help) === 1);
    assert.ok(blind.length >= 8, 'most evasions are invisible to the literal check');
    for (const [name, extra] of blind) {
      const d = decideHelp(withBody(extra), reviewed);
      assert.equal(d.reason, 'not-reviewed', name);
    }
  });

  it('stops promoting for any single-character edit anywhere in the help text', () => {
    const { help } = inputFor('11-11');
    for (const at of [0, 40, Math.floor(help.length / 2), help.length - 100]) {
      // Change the first letter of text content (not of a tag name) after `at`.
      const edited = `${help.slice(0, at)}${help.slice(at).replace(/>([^<]*?)[a-wyz]/, '>$1x')}`;
      assert.notEqual(edited, help);
      assert.equal(
        decideHelp({ ...inputFor('11-11'), help: edited }, reviewed).promoted,
        false,
        `edit at ${at}`,
      );
    }
  });

  it('ignores formatting-only changes that leave the visible text identical', () => {
    const i = inputFor('11-11');
    const reflowed = i.help.replace('<ul>', '<ul>\n  ').replace(/<\/li><li>/g, '</li>\n<li>');
    assert.notEqual(reflowed, i.help);
    assert.equal(decideHelp({ ...i, help: reflowed }, reviewed).promoted, true);
  });
});

describe('help rule ledger: answers as the client renders them', () => {
  it('reads label before value, as the client does', () => {
    assert.deepEqual(answerLabels([{ value: 'V' }, { label: 'L' }, { label: 'L2', value: 'V2' }]), [
      'V',
      'L',
      'L2',
    ]);
    assert.deepEqual(answerLabels([{}, { label: null, value: 'V' }, { label: '', value: 'V' }]), [
      '',
      'V',
      '',
    ]);
  });

  it('hashes the tree shape ({value}) and the client shape ({label}) identically', () => {
    const i = inputFor('11-11');
    const asLabels = { ...i, answers: i.answers.map((a) => ({ label: a.value })) };
    const approved = approvedHashes(ledgerOf(['11-11']));
    assert.equal(decideHelp(i, approved).promoted, true);
    assert.equal(decideHelp(asLabels, approved).promoted, true);
    const both = { ...i, answers: i.answers.map((a) => ({ label: a.value, value: 'ignored' })) };
    assert.equal(decideHelp(both, approved).promoted, true);
  });
});

describe('help rule ledger: review text', () => {
  it('hashes a documented, field-separated normalisation', () => {
    const input = {
      state: 'texas',
      question: ' <b>Q</b>\n ?',
      rule: 'Rule.',
      help: '<p>Help <i>text</i></p>',
      answers: ['A <i>one</i>', 'B'],
    };
    const t = reviewText(input);
    assert.equal(
      t.all,
      'state=texas\u001fquestion=Q ?\u001frule=Rule.\u001fhelp=Help text\u001fanswers=A one\u001eB',
    );
    assert.equal(fingerprint(input).hash, createHash('sha256').update(t.all, 'utf8').digest('hex'));
  });

  it('cannot be forged by moving text across a field boundary', () => {
    const base = { state: 's', question: 'Q', rule: 'R', help: 'H', answers: ['A'] };
    const a = fingerprint({ ...base, question: 'Q\u001frule=R', rule: 'X' });
    const b = fingerprint({ ...base, rule: 'R\u001frule=X' });
    assert.notEqual(a.hash, b.hash);
    const c = fingerprint({ ...base, answers: ['A\u001eB'] });
    const d = fingerprint({ ...base, answers: ['A', 'B'] });
    assert.notEqual(c.hash, d.hash);
  });

  it('is computed by the browser hash exactly as by node:crypto for every rule in the tree', () => {
    let checked = 0;
    for (const [id, n] of Object.entries(texas.nodes)) {
      if (!n.help) continue;
      const rule = candidateRule(n.help);
      if (rule === null) continue;
      const t = reviewText({
        state: 'texas',
        question: n.question,
        rule,
        help: n.help,
        answers: answerLabels(n.answers),
      });
      for (const s of [t.all, t.question, t.rule, t.help, t.answers]) {
        assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), `${id}`);
      }
      checked += 1;
    }
    assert.ok(checked >= 20);
  });

  describe('rule text is plain text, not HTML', () => {
    // The rule is decoded text, so a decoded "<" must not be parsed as markup a second time.
    const base = {
      state: 'texas',
      question: 'Were you convicted?',
      help: '<p>H</p>',
      answers: ['Yes', 'No'],
    };
    const ruleOf = (rule: string) => reviewText({ ...base, rule }).rule;

    it('keeps every character of a rule that contains "<"', () => {
      for (const rule of [
        'A<B',
        'if x<y then',
        'age<seventeen years',
        'x <p> y',
        'a <br> b',
        'the <b>term',
        'A&amp;B',
      ]) {
        assert.equal(ruleOf(rule), rule);
      }
    });

    it('hashes the text the box shows, so a reviewed hash cannot approve different text', () => {
      const input = {
        state: 'texas',
        question: 'Were you convicted?',
        answers: [{ value: 'Yes' }, { value: 'No' }],
      };
      // Each body decodes to visible text containing markup-looking characters. The directive the
      // box would show is what the reviewer saw, and an approval of the same sentence without the
      // extra word never covers it.
      const bodies = [
        'Answer YES if you were &amp;lt;!-- NOT --&amp;gt; convicted.',
        'Answer YES if you were &amp;lt;script&amp;gt;NOT&amp;lt;/script&amp;gt; convicted.',
        'Answer YES if you were &lt;!-- NOT --&gt; convicted.',
        'Answer YES if you were &lt;script&gt;NOT&lt;/script&gt; convicted.',
        'Answer YES if you were &lt;i&gt;NOT&lt;/i&gt; convicted.',
      ];
      const plainHelp = '<h5><u>T</u></h5><p><b>Answer YES if you were convicted.</b></p>';
      const forPlain = new Set([
        fingerprint({
          state: input.state,
          question: input.question,
          rule: 'Answer YES if you were convicted.',
          help: plainHelp,
          answers: ['Yes', 'No'],
        }).hash,
      ]);
      for (const body of bodies) {
        const help = `<h5><u>T</u></h5><p><b>${body}</b></p>`;
        assert.equal(decideHelp({ ...input, help }, forPlain).promoted, false, body);
        const shown = transformHelp(help, { directiveGate: 'single-rule' }).directive;
        assert.ok(shown?.includes('NOT'), `${body} keeps its visible text`);
        const forThis = new Set([
          fingerprint({
            state: input.state,
            question: input.question,
            rule: shown ?? '',
            help,
            answers: ['Yes', 'No'],
          }).hash,
        ]);
        assert.equal(decideHelp({ ...input, help }, forThis).promoted, true, body);
        assert.equal(reviewText({ ...base, rule: shown ?? '' }).rule, shown);
      }
    });

    it('prints the full rule on the review sheet', () => {
      const nodes = {
        n: {
          question: 'Q?',
          help: '<h5>T</h5><p><b>Answer YES if x&lt;y then you qualify.</b></p>',
          answers: [{ value: 'Yes' }, { value: 'No' }],
        },
      };
      const sheet = formatReviewSheet('s', 'n', nodes);
      assert.match(sheet, /Rule: {6}Answer YES if x<y then you qualify\./);
    });
  });

  it('prints a review sheet with the hash, the whole help text and without a reviewer', () => {
    const sheet = formatReviewSheet('texas', '11-11', texas.nodes);
    assert.match(sheet, /Question: {2}Were you convicted of disorderly conduct/);
    assert.match(sheet, /Rule: {6}Answer YES to this question if you were convicted/);
    assert.match(sheet, /Answer 2: {2}No, this conviction was for something else/);
    assert.match(sheet, /The following is a list of criminal offenses listed in Chapter 42/);
    assert.match(sheet, /covers the words of the question, the rule, every answer/);
    assert.ok(sheet.includes(entryFor('11-11').hash));
    assert.match(sheet, /"reviewedBy": ""/);
    assert.doesNotMatch(sheet, /PLACEHOLDER/);
    assert.match(formatReviewSheet('texas', '1-1', texas.nodes), /cannot be promoted/);
  });

  it('shows the help text with its structure, one list item per line', () => {
    const sheet = formatReviewSheet('texas', '11-11', texas.nodes);
    const lines = sheet.split('\n');
    assert.ok(lines.includes('Title: Disorderly Conduct Offenses'));
    assert.ok(lines.includes('The following is a list of criminal offenses listed in Chapter 42:'));
    for (const item of [
      'Disorderly Conduct',
      'Riot',
      'Illumination of Aircraft by Intense Light',
    ]) {
      assert.ok(lines.includes(`- ${item}`), item);
    }
    assert.equal(lines.filter((l) => l.startsWith('- ')).length, 16);
  });

  it('shows numbered and statute lists with markers, nested items indented', () => {
    const numbered = formatReviewSheet('texas', '4-11', texas.nodes).split('\n');
    assert.ok(numbered.includes('1. Murder'));
    assert.ok(numbered.includes('11. Burglary'));
    const statute = formatReviewSheet('texas', '7-14', texas.nodes).split('\n');
    assert.ok(statute.some((l) => /^\(a\) Habitual felony conduct is conduct/.test(l)));
    assert.ok(statute.some((l) => /^ {2}\(1\) the child who engaged/.test(l)));
    assert.ok(statute.some((l) => /^ {2}\(3\) all appeals/.test(l)));
  });

  it('states what the approval covers and what it does not', () => {
    const sheet = formatReviewSheet('texas', '11-11', texas.nodes);
    assert.match(sheet, /covers the words of the question, the rule, every answer and the entire/);
    assert.match(sheet, /Any change to those words withdraws the box/);
    assert.match(sheet, /Formatting changes that leave the words the same .* do not\./);
    assert.doesNotMatch(sheet, /any later change/i);
  });

  it('says plainly when the node does not exist', () => {
    assert.equal(
      formatReviewSheet('texas', '99-9', texas.nodes),
      'No node 99-9 in the texas tree.',
    );
    assert.equal(
      formatReviewSheet('texas', '__proto__', texas.nodes),
      'No node __proto__ in the texas tree.',
    );
  });

  it('lists the other nodes an approval also covers', () => {
    const sheet = formatReviewSheet('texas', '5-2', texas.nodes);
    assert.match(sheet, /also covers nodes with identical content: texas:6-1\./);
    assert.doesNotMatch(
      formatReviewSheet('texas', '11-11', texas.nodes),
      /also covers nodes with identical content/,
    );
  });
});

// ─── The committed ledger ────────────────────────────────────────────────────

/**
 * Everything wrong with a ledger, as readable messages that name the node and, when the
 * content changed since review, which part changed.
 */
function ledgerProblems(ledger: unknown, treeFor: (state: string) => Tree | null): string[] {
  const problems: string[] = [];
  const file = ledger as { version?: unknown; entries?: Record<string, Partial<LedgerEntry>> };
  if (file.version !== 1) problems.push(`version must be 1, found ${JSON.stringify(file.version)}`);
  for (const [key, entry] of Object.entries(file.entries ?? {})) {
    const [state = '', nodeId = ''] = key.split(':');
    if (entry.reviewed !== true) problems.push(`${key}: reviewed must be true`);
    if (typeof entry.hash !== 'string' || !/^[0-9a-f]{64}$/.test(entry.hash)) {
      problems.push(`${key}: hash must be 64 lowercase hex characters`);
    }
    if (typeof entry.reviewedBy !== 'string' || entry.reviewedBy.trim() === '') {
      problems.push(`${key}: reviewedBy must name the person who reviewed it`);
    } else if (/placeholder/i.test(entry.reviewedBy)) {
      problems.push(`${key}: reviewedBy "${entry.reviewedBy}" is a placeholder, not a review`);
    }
    if (
      typeof entry.reviewedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(entry.reviewedAt) ||
      Number.isNaN(Date.parse(entry.reviewedAt))
    ) {
      problems.push(`${key}: reviewedAt must be an ISO 8601 date or timestamp`);
    }
    const tree = treeFor(state);
    const n = tree?.nodes[nodeId];
    if (!tree || !n) {
      problems.push(
        `${key}: no such node in the ${state} tree (remove the entry, or re-review its replacement)`,
      );
      continue;
    }
    const rule = n.help ? candidateRule(n.help) : null;
    if (rule === null) {
      problems.push(
        `${key}: the help no longer has a single "answer yes/no" rule, so the box cannot show. Remove the entry or re-review.`,
      );
      continue;
    }
    const now = fingerprint({
      state,
      question: n.question,
      rule,
      help: n.help ?? '',
      answers: answerLabels(n.answers),
    });
    if (now.hash !== entry.hash) {
      const names = { question: 'question', rule: 'rule', help: 'help text', answers: 'answers' };
      const changed = (['question', 'rule', 'help', 'answers'] as const)
        .filter((f) => now.fields[f] !== entry.fields?.[f])
        .map((f) => names[f]);
      problems.push(
        `${key}: ${changed.length ? changed.join(' and ') : 'content'} changed since review on ${entry.reviewedAt}. Re-review it, then update the hash to ${now.hash}.`,
      );
    }
  }
  return problems;
}

describe('committed help rule ledger', () => {
  const committed = JSON.parse(
    readFileSync(new URL('./helpRuleLedger.json', import.meta.url), 'utf8'),
  ) as unknown;

  it('has only valid, current, human-reviewed entries', () => {
    const problems = ledgerProblems(committed, loadTree);
    assert.deepEqual(problems, [], `\n${problems.join('\n')}\n`);
  });

  it('is rejected by the validity check when an entry is wrong (the check has teeth)', () => {
    const good = entryFor('11-11');
    const withEntries = (entries: Record<string, unknown>) => ({ version: 1, entries });
    const expectProblem = (ledger: unknown, pattern: RegExp) =>
      assert.match(ledgerProblems(ledger, loadTree).join('\n'), pattern);

    assert.deepEqual(ledgerProblems(withEntries({ 'texas:11-11': good }), loadTree), []);
    expectProblem(
      withEntries({ 'texas:11-11': { ...good, reviewedBy: 'PLACEHOLDER (seeded)' } }),
      /texas:11-11: reviewedBy .* placeholder/,
    );
    expectProblem(
      withEntries({ 'texas:11-11': { ...good, reviewedBy: ' ' } }),
      /reviewedBy must name/,
    );
    expectProblem(
      withEntries({ 'texas:11-11': { ...good, reviewedAt: 'yesterday' } }),
      /reviewedAt must be an ISO/,
    );
    expectProblem(
      withEntries({ 'texas:11-11': { ...good, reviewed: false } }),
      /reviewed must be true/,
    );
    expectProblem(withEntries({ 'texas:11-11': { ...good, hash: 'abc' } }), /hash must be 64/);
    expectProblem(withEntries({ 'texas:99-9': good }), /texas:99-9: no such node/);
    expectProblem(withEntries({ 'nowhere:11-11': good }), /nowhere:11-11: no such node/);
    expectProblem(withEntries({ 'texas:1-1': good }), /texas:1-1: the help no longer has a single/);
    expectProblem({ version: 2, entries: {} }, /version must be 1/);
  });

  it('names the node and the part that changed when reviewed content is edited', () => {
    const good = entryFor('11-11');
    const ledger = { version: 1, entries: { 'texas:11-11': good } };
    const edit = (change: (n: TreeNode) => TreeNode): Tree => ({
      state: 'texas',
      nodes: { ...texas.nodes, '11-11': change(node('11-11')) },
    });
    const messageFor = (tree: Tree) => ledgerProblems(ledger, () => tree).join('\n');

    assert.match(
      messageFor(
        edit((n) => ({ ...n, help: (n.help ?? '').replace('convicted of', 'charged with') })),
      ),
      /^texas:11-11: rule and help text changed since review on 2026-01-01\. Re-review it, then update the hash to [0-9a-f]{64}\.$/,
    );
    assert.match(
      messageFor(
        edit((n) => ({ ...n, help: `${n.help ?? ''}<p>Select NO if you are unsure.</p>` })),
      ),
      /^texas:11-11: help text changed since review on 2026-01-01\./,
    );
    assert.match(
      messageFor(edit((n) => ({ ...n, question: n.question.replace('convicted', 'charged') }))),
      /^texas:11-11: question changed since review/,
    );
    assert.match(
      messageFor(edit((n) => ({ ...n, answers: [{ value: 'Yes' }, ...n.answers.slice(1)] }))),
      /^texas:11-11: answers changed since review/,
    );
    assert.match(
      messageFor(
        edit((n) => ({
          ...n,
          question: `${n.question}!`,
          help: (n.help ?? '').replace('convicted of', 'charged with'),
        })),
      ),
      /^texas:11-11: question and rule and help text changed since review/,
    );
  });

  it('agrees with the file the app imports', () => {
    assert.deepEqual(entriesOf(committed), (committed as Ledger).entries);
  });

  it('lists the unreviewed rules (advisory: they render as ordinary bold text)', (t) => {
    const reviewed = new Set(Object.keys((committed as Ledger).entries));
    const unreviewed = Object.entries(texas.nodes)
      .filter(([id, n]) => n.help && candidateRule(n.help) !== null && !reviewed.has(`texas:${id}`))
      .map(([id, n]) => `texas:${id} "${plainText(n.question).slice(0, 70)}"`);
    t.diagnostic(
      `unreviewed rules (${unreviewed.length}), shown as ordinary bold text until reviewed:`,
    );
    for (const line of unreviewed) t.diagnostic(`  ${line}`);
  });
});
