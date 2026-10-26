import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeProgress,
  describeProgress,
  isRepeatedQuestion,
  questionKey,
} from './QuickFormClient.utils.js';

describe('computeProgress', () => {
  it('starts at zero before anything is answered', () => {
    assert.equal(computeProgress(0, 18), 0);
  });

  it('is the share of answered steps out of answered plus estimated remaining', () => {
    assert.equal(computeProgress(3, 9), 0.25);
  });

  it('follows a revised estimate instead of a fixed starting total', () => {
    // A branch that turns out longer than first estimated lowers the fraction.
    assert.ok(computeProgress(4, 12) < computeProgress(3, 4));
  });

  it('reaches one when nothing remains', () => {
    assert.equal(computeProgress(5, 0), 1);
  });

  it('is zero when there is nothing answered and nothing remaining', () => {
    assert.equal(computeProgress(0, 0), 0);
  });

  it('treats a negative estimate as nothing remaining', () => {
    assert.equal(computeProgress(2, -3), 1);
  });
});

describe('describeProgress', () => {
  it('labels the remainder as an estimate', () => {
    const { summary, valueText } = describeProgress(3, 9);
    assert.equal(summary, '3 answered · about 9 left');
    assert.equal(valueText, '3 answered, about 9 remaining');
  });

  it('says last question instead of "about 0 left"', () => {
    for (const remaining of [1, 0]) {
      const { summary, valueText } = describeProgress(7, remaining);
      assert.equal(summary, '7 answered · last question');
      assert.equal(valueText, '7 answered, last question');
    }
  });
});

// A node is a (group, variant) pair; the variant is only visible through the wording and answers.
const node = (id: string) => {
  const group = Number(id.split('-')[0]);
  return {
    questionId: group,
    questionText: `Question ${id}`,
    answers: [
      { label: `Yes (${id})`, position: 1 },
      { label: `No (${id})`, position: 2 },
    ],
  };
};

// Walks the nodes in order and reports, for each one after the first, whether the guard fires.
function walk(ids: string[]): boolean[] {
  const answered: string[] = [];
  return ids.map((id, i) => {
    const key = questionKey(node(id));
    const repeated = i > 0 && isRepeatedQuestion(answered, key);
    answered.push(key);
    return repeated;
  });
}

describe('isRepeatedQuestion', () => {
  it('fires only when a node of a cyclic walk comes back', () => {
    const flags = walk(['1-2', '2-5', '3-9', '4-11', '5-8', '6-9', '1-1', '2-4', '1-2']);
    assert.deepEqual(flags, [false, false, false, false, false, false, false, false, true]);
  });

  it('allows a group to recur as a different variant', () => {
    assert.deepEqual(walk(['1-1', '2-4', '1-2', '2-5']), [false, false, false, false]);
    assert.deepEqual(walk(['7-11', '7-12']), [false, false]);
  });

  it('stays false on a path with no repeated node', () => {
    assert.deepEqual(walk(['0-0', '1-1', '2-3', '3-4', '4-5']), [
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('questionKey', () => {
  it('is the same for the raw value shape and the API label shape of one node', () => {
    const raw = {
      questionId: 0,
      questionText: 'What best describes this case?',
      answers: [
        { value: 'Arrested', position: 0 },
        { value: 'Convicted', position: 1 },
      ],
    };
    const api = {
      ...raw,
      answers: [
        { label: 'Arrested', position: 0 },
        { label: 'Convicted', position: 1 },
      ],
    };
    assert.equal(questionKey(raw), questionKey(api));
  });

  it('differs when only one answer label differs', () => {
    const a = node('1-1');
    const b = {
      ...a,
      answers: [
        { label: 'Other', position: 1 },
        { label: 'No (1-1)', position: 2 },
      ],
    };
    assert.notEqual(questionKey(a), questionKey(b));
  });

  it('differs when only the question text differs', () => {
    const a = node('1-1');
    assert.notEqual(questionKey(a), questionKey({ ...a, questionText: 'Reworded question' }));
  });

  it('differs when only the answer set differs, as with two variants of one group', () => {
    const a = node('7-11');
    const b = { ...a, answers: [...a.answers, { label: 'Not sure', position: 3 }] };
    assert.notEqual(questionKey(a), questionKey(b));
  });

  it('differs when only the group differs', () => {
    const a = node('1-1');
    assert.notEqual(questionKey(a), questionKey({ ...a, questionId: 2 }));
  });
});
