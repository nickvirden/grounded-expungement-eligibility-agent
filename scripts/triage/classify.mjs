/**
 * The one classification function the triage workflow calls (DECISIONS.md
 * section 22). Replacing the classifier means replacing `classifyIssue` and
 * `CLASSIFIER_ID`; nothing else in `scripts/triage/` knows how it works.
 *
 * Issue text is data. It is passed here as plain arguments and must never reach
 * a shell, a tool-using prompt, or a path or payload of a GitHub write.
 */

/** Typed questions the rubric in .github/TRIAGE.md breaks into. */
export const QUESTION_IDS = Object.freeze([
  'eligibility',
  'security',
  'dead-end',
  'workaround',
  'cosmetic',
  'unobserved',
]);

export const PRIORITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);

/**
 * `'stub'` means no real classifier is wired in. The runner refuses to write
 * labels while this value is unchanged, whatever `.github/triage.json` says.
 */
export const CLASSIFIER_ID = 'stub';

/** Below this confidence the runner applies P2 and `needs-verification`. Provisional. */
export const CONFIDENCE_CUTOFF = 0.7;

/**
 * @typedef {'eligibility' | 'security' | 'dead-end' | 'workaround' | 'cosmetic' | 'unobserved'} QuestionId
 *
 * @typedef {object} ClassifierResult
 * @property {'P0' | 'P1' | 'P2' | 'P3'} priority
 * @property {boolean} needsVerification
 * @property {Record<QuestionId, number>} probabilities Each value in [0, 1].
 * @property {number} confidence In [0, 1].
 */

/**
 * @param {{ title: string, body: string, labels: string[] }} _issue
 * @param {{ signal: AbortSignal }} _options
 * @returns {Promise<ClassifierResult>}
 */
export async function classifyIssue(_issue, _options) {
  // Zero confidence on purpose: it exercises the below-cutoff path end to end.
  return {
    priority: 'P2',
    needsVerification: true,
    probabilities: Object.fromEntries(QUESTION_IDS.map((id) => [id, 0])),
    confidence: 0,
  };
}

const isProbability = (value) => typeof value === 'number' && value >= 0 && value <= 1;

/**
 * Classifier output is untrusted: a malformed result must never become a label.
 *
 * @param {unknown} result
 * @returns {ClassifierResult}
 */
export function validateClassifierResult(result) {
  if (typeof result !== 'object' || result === null) {
    throw new TypeError('classifier result is not an object');
  }
  if (!PRIORITIES.includes(result.priority)) {
    throw new TypeError('classifier result has an unknown priority');
  }
  if (typeof result.needsVerification !== 'boolean') {
    throw new TypeError('classifier result needsVerification is not a boolean');
  }
  if (!isProbability(result.confidence)) {
    throw new TypeError('classifier result confidence is not in [0, 1]');
  }
  const { probabilities } = result;
  if (typeof probabilities !== 'object' || probabilities === null) {
    throw new TypeError('classifier result probabilities is not an object');
  }
  const keys = Object.keys(probabilities);
  if (keys.length !== QUESTION_IDS.length || !QUESTION_IDS.every((id) => keys.includes(id))) {
    throw new TypeError('classifier result probabilities do not match the question ids');
  }
  if (!QUESTION_IDS.every((id) => isProbability(probabilities[id]))) {
    throw new TypeError('classifier result has a probability outside [0, 1]');
  }
  return result;
}
