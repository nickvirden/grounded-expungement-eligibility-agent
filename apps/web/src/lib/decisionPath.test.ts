import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decodeDecisionPath } from './decisionPath.js';
import { type StateTree, stateTreeSchema } from './schemas.js';

// Small fixture tree, independent of any real state's data, covering:
//  - a multi-step question → question → result chain
//  - a node where two distinct answers share one position (group 2)
const fixtureTree: StateTree = {
  entryNodeId: 'q0',
  nodes: {
    q0: {
      group: 0,
      question: 'What happened?',
      answers: [
        { value: 'Arrested, not convicted', position: 0 },
        { value: 'Convicted', position: 1 },
      ],
    },
    q1: {
      group: 1,
      question: 'What was the outcome?',
      answers: [
        { value: 'Dismissed', position: 0 },
        { value: 'Acquitted', position: 1 },
      ],
    },
    q2: {
      group: 2,
      question: 'What type of probation?',
      answers: [
        { value: 'Straight probation, completed', position: 0 },
        { value: 'Never on probation', position: 0 },
      ],
    },
  },
  transitions: [
    {
      from: { questionId: 0, answerPosition: 0 },
      to: { type: 'question', questionId: 1, nodeId: 'q1' },
    },
    {
      from: { questionId: 1, answerPosition: 0 },
      to: { type: 'result', value: 'Does Not Qualify' },
    },
    {
      from: { questionId: 1, answerPosition: 1 },
      to: { type: 'question', questionId: 2, nodeId: 'q2' },
    },
    { from: { questionId: 2, answerPosition: 0 }, to: { type: 'result', value: 'Qualifies' } },
  ],
};

describe('decodeDecisionPath', () => {
  it('decodes a multi-step N:M path in order', () => {
    const steps = decodeDecisionPath(['0:0', '1:1'], fixtureTree);
    assert.equal(steps.length, 2);
    const [first, second] = steps;
    assert.deepEqual(first, {
      kind: 'answered',
      raw: '0:0',
      questionHtml: 'What happened?',
      answerHtmls: ['Arrested, not convicted'],
    });
    assert.deepEqual(second, {
      kind: 'answered',
      raw: '1:1',
      questionHtml: 'What was the outcome?',
      answerHtmls: ['Acquitted'],
    });
  });

  it('decodes the same path in qN:aM format identically', () => {
    const steps = decodeDecisionPath(['q0:a0', 'q1:a1'], fixtureTree);
    assert.equal(steps.length, 2);
    const [first, second] = steps;
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.kind, 'answered');
    assert.equal(second.kind, 'answered');
    if (first.kind === 'answered') assert.equal(first.questionHtml, 'What happened?');
    if (second.kind === 'answered') assert.equal(second.questionHtml, 'What was the outcome?');
  });

  it('decodes every step including one whose transition leads to a result', () => {
    const steps = decodeDecisionPath(['0:0', '1:0'], fixtureTree);
    assert.equal(steps.length, 2);
    const [first, second] = steps;
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.kind, 'answered');
    assert.equal(second.kind, 'answered');
    if (second.kind === 'answered') assert.equal(second.answerHtmls[0], 'Dismissed');
  });

  it('recovers from a free-text unparseable entry without losing neighboring steps', () => {
    const steps = decodeDecisionPath(['0:0', 'Asked about dismissal', '1:1'], fixtureTree);
    assert.equal(steps.length, 3);
    const [first, second, third] = steps;
    assert.ok(first);
    assert.ok(third);
    assert.equal(first.kind, 'answered');
    assert.deepEqual(second, { kind: 'unrecognized', raw: 'Asked about dismissal' });
    // The cursor resets to null after an unparseable entry, so the next
    // (otherwise valid) entry can no longer be matched against a known node.
    assert.equal(third.kind, 'unrecognized');
  });

  it('marks an entry with no matching transition or node as unrecognized', () => {
    const steps = decodeDecisionPath(['5:9'], fixtureTree);
    assert.equal(steps.length, 1);
    assert.deepEqual(steps[0], { kind: 'unrecognized', raw: '5:9' });
  });

  it('treats a null tree as all-unrecognized without throwing', () => {
    const steps = decodeDecisionPath(['0:0', '1:1', 'garbage'], null);
    assert.equal(steps.length, 3);
    for (const step of steps) {
      assert.equal(step.kind, 'unrecognized');
    }
  });

  it('includes every answer sharing a position within one node', () => {
    const steps = decodeDecisionPath(['0:0', '1:1', '2:0'], fixtureTree);
    assert.equal(steps.length, 3);
    const last = steps[2];
    assert.ok(last);
    assert.equal(last.kind, 'answered');
    if (last.kind === 'answered') {
      assert.deepEqual(last.answerHtmls, ['Straight probation, completed', 'Never on probation']);
    }
  });

  it('every test case returns output length equal to input length', () => {
    const cases: Array<[string[], StateTree | null]> = [
      [['0:0', '1:1'], fixtureTree],
      [['q0:a0', 'q1:a1'], fixtureTree],
      [['0:0', '1:0'], fixtureTree],
      [['0:0', 'Asked about dismissal', '1:1'], fixtureTree],
      [['5:9'], fixtureTree],
      [['0:0', '1:1', 'garbage'], null],
      [['0:0', '1:1', '2:0'], fixtureTree],
    ];
    for (const [path, tree] of cases) {
      assert.equal(decodeDecisionPath(path, tree).length, path.length);
    }
  });

  it('parses the real Texas tree and decodes its actual root question and answer text', () => {
    const raw = readFileSync(
      new URL('../../../../packages/shared/state-trees/texas.json', import.meta.url),
    );
    const parsed = stateTreeSchema.parse(JSON.parse(raw.toString()));

    const nmSteps = decodeDecisionPath(['0:0', '1:1'], parsed);
    assert.equal(nmSteps.length, 2);
    const [nmFirst, nmSecond] = nmSteps;
    assert.ok(nmFirst);
    assert.ok(nmSecond);
    assert.equal(nmFirst.kind, 'answered');
    if (nmFirst.kind === 'answered') {
      assert.equal(nmFirst.questionHtml, 'What best describes this Texas case?');
      assert.deepEqual(nmFirst.answerHtmls, [
        "I was arrested, but it didn't end up resulting in a conviction",
      ]);
    }
    assert.equal(nmSecond.kind, 'answered');
    if (nmSecond.kind === 'answered') {
      assert.deepEqual(nmSecond.answerHtmls, [
        'I was acquitted, pardoned, or my conviction was overturned on appeal',
      ]);
    }

    const prefixedSteps = decodeDecisionPath(['q0:a0'], parsed);
    assert.equal(prefixedSteps.length, 1);
    const [prefixedFirst] = prefixedSteps;
    assert.ok(prefixedFirst);
    assert.equal(prefixedFirst.kind, 'answered');
    if (prefixedFirst.kind === 'answered') {
      assert.equal(prefixedFirst.questionHtml, 'What best describes this Texas case?');
    }
  });
});
