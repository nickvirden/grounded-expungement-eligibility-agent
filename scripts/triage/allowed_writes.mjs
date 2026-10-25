/**
 * The complete set of GitHub writes the triage workflow may make. Every
 * non-GET request passes through `assertAllowedWrite` in `github.mjs`, so a
 * bug or a hostile classifier result cannot reach any other endpoint.
 *
 * Adding a write is a deliberate edit here and to the test that pins this list.
 */

export const P_LABELS = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const NEEDS_VERIFICATION = 'needs-verification';

/**
 * `target` says which issue the path may name: a candidate being labeled, or
 * the rolling digest issue. Paths are relative to `/repos/{owner}/{repo}`.
 * Labels are only ever added (POST); replacing or removing them is not allowed.
 */
export const ALLOWED_WRITES = Object.freeze([
  Object.freeze({
    id: 'add-labels',
    method: 'POST',
    path: /^\/issues\/([1-9]\d{0,9})\/labels$/,
    target: 'candidate',
    bodyKeys: Object.freeze(['labels']),
  }),
  Object.freeze({
    id: 'digest-comment',
    method: 'POST',
    path: /^\/issues\/([1-9]\d{0,9})\/comments$/,
    target: 'digest',
    bodyKeys: Object.freeze(['body']),
  }),
  Object.freeze({
    id: 'digest-body',
    method: 'PATCH',
    path: /^\/issues\/([1-9]\d{0,9})$/,
    target: 'digest',
    bodyKeys: Object.freeze(['body']),
  }),
]);

function assertLabels(labels) {
  if (!Array.isArray(labels) || labels.length < 1 || labels.length > 2) {
    throw new Error('write refused: labels must be one P label plus optional needs-verification');
  }
  if (new Set(labels).size !== labels.length) {
    throw new Error('write refused: duplicate label');
  }
  const pLabels = labels.filter((label) => P_LABELS.includes(label));
  const others = labels.filter((label) => !P_LABELS.includes(label));
  if (pLabels.length !== 1 || others.some((label) => label !== NEEDS_VERIFICATION)) {
    throw new Error('write refused: label outside the allowlist');
  }
}

/**
 * @param {{ method: string, path: string, body: unknown }} request
 * @param {{ digestNumber?: number }} context
 */
export function assertAllowedWrite({ method, path, body }, { digestNumber } = {}) {
  const rule = ALLOWED_WRITES.find((entry) => entry.method === method && entry.path.test(path));
  if (!rule) {
    throw new Error(`write refused: ${method} ${path} is not on the allowlist`);
  }
  const issueNumber = Number(path.match(rule.path)[1]);
  const isDigest = Number.isSafeInteger(digestNumber) && issueNumber === digestNumber;
  if (rule.target === 'digest' && !isDigest) {
    throw new Error('write refused: only the digest issue may be commented on or edited');
  }
  if (rule.target === 'candidate' && isDigest) {
    throw new Error('write refused: the digest issue is never labeled');
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('write refused: body must be an object');
  }
  const keys = Object.keys(body);
  if (keys.length !== rule.bodyKeys.length || !rule.bodyKeys.every((key) => keys.includes(key))) {
    throw new Error(`write refused: body keys must be exactly ${rule.bodyKeys.join(', ')}`);
  }
  if (rule.id === 'add-labels') {
    assertLabels(body.labels);
  } else if (typeof body.body !== 'string') {
    throw new Error('write refused: body must be a string');
  }
}
